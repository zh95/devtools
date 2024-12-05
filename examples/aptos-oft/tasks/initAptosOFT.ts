import { Aptos, AptosConfig } from '@aptos-labs/ts-sdk'
import { OFT } from '../sdk/oft'
import { getAptosOftAddress, networkToIndexerMapping, sendAllTxs } from './utils/utils'
import { getLzNetworkStage, parseYaml } from './utils/aptosNetworkParser'

async function main() {
    const { account_address, private_key, network, fullnode, faucet } = await parseYaml()
    console.log(`Using aptos network ${network}`)

    const aptosConfig = new AptosConfig({
        network: network,
        fullnode: fullnode,
        indexer: networkToIndexerMapping[network],
        faucet: faucet,
    })
    const aptos = new Aptos(aptosConfig)

    const lzNetworkStage = getLzNetworkStage(network)
    const aptosOftAddress = getAptosOftAddress(lzNetworkStage)
    console.log(`\n⚡ Initializing Aptos OFT`)
    console.log(`   Address: ${aptosOftAddress}`)

    const tokenName = 'OFT'
    const tokenSymbol = 'OFT'
    const iconUri = ''
    const projectUri = ''
    const sharedDecimals = 6
    const localDecimals = 6

    const oft = new OFT(aptos, aptosOftAddress, account_address, private_key)
    const initializePayload = oft.initializePayload(
        tokenName,
        tokenSymbol,
        iconUri,
        projectUri,
        sharedDecimals,
        localDecimals
    )
    sendAllTxs(aptos, oft, account_address, [initializePayload])
}

main().catch((error) => {
    console.error('Error:', error)
    process.exit(1)
})
