import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk'
import { OFT } from '../sdk/oft'
import * as fs from 'fs'
import * as path from 'path'
import type { OAppOmniGraphHardhat } from '@layerzerolabs/toolbox-hardhat'
import { createEidToNetworkMapping, getConfigConnections } from './utils/utils'
import { loadAptosYamlConfig } from './utils/config'
import { ExecutorOptionType, Options } from '@layerzerolabs/lz-v2-utilities-v3'
import { UlnConfig } from './utils'
import { EndpointId, Stage } from '@layerzerolabs/lz-definitions-v3'
import { createSerializableUlnConfig } from './utils/ulnConfigBuilder'

const networkToIndexerMapping = {
    [Network.CUSTOM]: 'http://127.0.0.1:8090/v1',
}

// assign nonces, then for each transaction send, spam sending until its successful
async function main() {
    const { account_address, private_key, network, fullnode, faucet } = await parseYaml()
    console.log(`using aptos network ${network}`)
    const aptosConfig = new AptosConfig({
        network: network,
        fullnode: fullnode,
        indexer: networkToIndexerMapping[network],
        faucet: faucet,
    })

    const aptos = new Aptos(aptosConfig)

    const lzNetworkStage = getLzNetworkStage(network)
    const aptosOftAddress = getAptosOftAddress(lzNetworkStage)
    console.log(`using aptos oft address ${aptosOftAddress}`)

    const oft = new OFT(aptos, aptosOftAddress, account_address, private_key)

    console.log(`Setting delegate to ${account_address}`)
    await oft.setDelegate(account_address)

    const endpointId = getEndpointId(network, 'aptos')
    const connections = getConfigConnections('from', endpointId)

    console.log(connections)

    console.log('Setting peers\n')
    await setPeers(oft, connections)

    console.log('Setting enforced options\n')
    await setEnforcedOptions(oft, connections)

    console.log('Setting send library\n')
    await setSendLibrary(oft, connections)

    console.log('Setting receive library\n')
    await setReceiveLibrary(oft, connections)

    console.log('Setting receive library timeout\n')
    await setReceiveLibraryTimeout(oft, connections)

    console.log('Setting send config\n')
    await setSendConfig(oft, connections)

    console.log('Setting receive config\n')
    await setReceiveConfig(oft, connections)
}

function getLzNetworkStage(network: Network): Stage {
    if (network === Network.MAINNET) {
        return Stage.MAINNET
    } else if (network === Network.TESTNET) {
        return Stage.TESTNET
    } else if (network === Network.CUSTOM) {
        return Stage.SANDBOX
    } else {
        throw new Error(`Unsupported network: ${network}`)
    }
}

function getEndpointId(network: Network, chainName: string): number {
    if (chainName.toLowerCase() !== 'aptos') {
        throw new Error('Unsupported chain')
    }

    if (network === Network.MAINNET || network.toLowerCase() === 'mainnet') {
        return EndpointId.APTOS_V2_MAINNET
    } else if (network === Network.TESTNET || network.toLowerCase() === 'testnet') {
        return EndpointId.APTOS_V2_TESTNET
    } else if (network === Network.CUSTOM || network.toLowerCase() === 'sandbox') {
        return EndpointId.APTOS_V2_SANDBOX
    } else {
        throw new Error(`Unsupported network: ${network}`)
    }
}

async function setReceiveConfig(oft: OFT, connections: OAppOmniGraphHardhat['connections']) {
    for (const entry of connections) {
        if (!entry.config?.receiveConfig) {
            console.log(`No receive config specified for contract ${entry.to.contractName} on eid ${entry.to.eid}\n`)
            continue
        }

        if (entry.config.receiveConfig.ulnConfig) {
            const serializableUlnConfig = createSerializableUlnConfig(
                entry.config.receiveConfig.ulnConfig,
                entry.to,
                entry.from
            )
            const serializedUlnConfig = UlnConfig.serialize(entry.to.eid as EndpointId, serializableUlnConfig)

            await oft.setConfig(entry.config.receiveLibraryConfig.receiveLibrary, 2, serializedUlnConfig)
        }
    }
}

async function setSendConfig(oft: OFT, connections: OAppOmniGraphHardhat['connections']) {
    for (const entry of connections) {
        if (!entry.config?.sendConfig) {
            console.log(`No send config specified for contract ${entry.to.contractName} on eid ${entry.to.eid}\n`)
            continue
        }

        if (entry.config.sendConfig.ulnConfig) {
            const serializableUlnConfig = createSerializableUlnConfig(
                entry.config.sendConfig.ulnConfig,
                entry.to,
                entry.from
            )

            const serializedUlnConfig = UlnConfig.serialize(entry.to.eid as EndpointId, serializableUlnConfig)

            await oft.setConfig(entry.config.sendLibrary, 2, serializedUlnConfig)
        }
    }
}

async function setSendLibrary(oft: OFT, connections: OAppOmniGraphHardhat['connections']) {
    for (const entry of connections) {
        if (!entry.config?.sendLibrary) {
            console.log(`No send library specified for contract ${entry.to.contractName} on eid ${entry.to.eid}\n`)
            continue
        }
        console.log(
            `Setting send library for contract ${entry.to.contractName} on eid ${entry.to.eid} to ${entry.config.sendLibrary}\n`
        )

        await oft.setSendLibrary(entry.to.eid, entry.config.sendLibrary)
    }
}

async function setReceiveLibrary(oft: OFT, connections: OAppOmniGraphHardhat['connections']) {
    for (const entry of connections) {
        if (!entry.config?.receiveLibraryConfig?.receiveLibrary) {
            console.log(`No receive library specified for contract ${entry.to.contractName} on eid ${entry.to.eid}\n`)
            continue
        }
        await oft.setReceiveLibrary(
            entry.to.eid,
            entry.config.receiveLibraryConfig.receiveLibrary,
            Number(entry.config.receiveLibraryConfig.gracePeriod || 0)
        )
    }
}

async function setReceiveLibraryTimeout(oft: OFT, connections: OAppOmniGraphHardhat['connections']) {
    for (const entry of connections) {
        if (!entry.config?.receiveLibraryTimeoutConfig) {
            console.log(
                `No receive library timeout specified for contract ${entry.to.contractName} on eid ${entry.to.eid}\n`
            )
            continue
        }
        await oft.setReceiveLibraryTimeout(
            entry.to.eid,
            entry.config.receiveLibraryTimeoutConfig.lib,
            Number(entry.config.receiveLibraryTimeoutConfig.expiry)
        )
    }
}

async function setEnforcedOptions(oft: OFT, connections: OAppOmniGraphHardhat['connections']) {
    for (const entry of connections) {
        if (!entry.config?.enforcedOptions) {
            console.log(`No enforced options specified for contract ${entry.to.contractName} on eid ${entry.to.eid}\n`)
            continue
        }
        console.log(`Setting enforced options for contract ${entry.to.contractName} on eid ${entry.to.eid}\n`)
        for (const enforcedOption of entry.config.enforcedOptions) {
            const options = createOptions(enforcedOption)

            console.log('Enforced option:', enforcedOption)
            await oft.setEnforcedOptions(entry.to.eid, enforcedOption.msgType, options)
        }
    }

    function createOptions(enforcedOption) {
        const options = Options.newOptions()
        //TODO: Accept all option types
        if (enforcedOption.optionType === ExecutorOptionType.LZ_RECEIVE) {
            options.addExecutorLzReceiveOption(enforcedOption.gas, enforcedOption.value)
        } else if (enforcedOption.optionType === ExecutorOptionType.NATIVE_DROP) {
            options.addExecutorNativeDropOption(enforcedOption.amount, enforcedOption.receiver)
        }
        return options.toBytes()
    }
}

function getAptosOftAddress(stage: Stage) {
    const deploymentPath = path.join(__dirname, `../deployments/aptos-${stage}/oft.json`)
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'))
    return deployment.address
}

async function setPeers(oft: OFT, connections: OAppOmniGraphHardhat['connections']) {
    const eidToNetworkMapping = createEidToNetworkMapping()

    for (const entry of connections) {
        const networkName = eidToNetworkMapping[entry.to.eid]
        const contractAddress = getContractAddress(networkName, entry.to.contractName)

        console.log(`Calling set peer on ${networkName} with address ${contractAddress}, eid ${entry.to.eid}\n`)
        await oft.setPeer(entry.to.eid, contractAddress)
        console.log(`Peer set for ${networkName} (${entry.to.eid}) -> ${contractAddress} ✓\n`)
    }
}

function getContractAddress(networkName: string, contractName: string) {
    const deploymentPath = path.join(__dirname, `../deployments/${networkName}/${contractName}.json`)

    try {
        const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'))
        return deployment.address
    } catch (error) {
        throw new Error(`Failed to read deployment file for network ${networkName}: ${error}\n`)
    }
}

async function parseYaml(): Promise<{
    account_address: string
    private_key: string
    network: Network
    fullnode: string
    faucet: string
}> {
    const aptosYamlConfig = await loadAptosYamlConfig()

    const account_address = aptosYamlConfig.profiles.default.account
    const private_key = aptosYamlConfig.profiles.default.private_key
    const network = aptosYamlConfig.profiles.default.network.toLowerCase() as Network
    const fullnode = aptosYamlConfig.profiles.default.rest_url
    const faucet = aptosYamlConfig.profiles.default.faucet_url

    return { account_address, private_key, network, fullnode, faucet }
}

main().catch((error) => {
    console.error('Error:', error)
    process.exit(1)
})
