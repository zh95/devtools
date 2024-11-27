import hardhatConfig from '../../hardhat.config'
import lzConfig from '../../aptos.layerzero.config'
import type { OAppOmniGraphHardhat } from '@layerzerolabs/toolbox-hardhat'
import { HttpNetworkAccountsUserConfig } from 'hardhat/types'

export function createEidToNetworkMapping() {
    const networks = hardhatConfig.networks

    const eidNetworkNameMapping: Record<number, string> = {}
    for (const [networkName, networkConfig] of Object.entries(networks)) {
        eidNetworkNameMapping[networkConfig.eid] = networkName
    }

    eidNetworkNameMapping[50008] = 'aptos-mainnet'

    return eidNetworkNameMapping
}

export function createEidToNetworkUrlMapping() {
    const networks = hardhatConfig.networks

    const eidNetworkNameMapping: Record<number, string> = {}
    for (const [networkName, networkConfig] of Object.entries(networks)) {
        eidNetworkNameMapping[networkConfig.eid] = networkConfig.url as HttpNetworkUserConfig
    }

    eidNetworkNameMapping[50008] = 'aptos-mainnet'

    return eidNetworkNameMapping
}

export function getConfigConnections(_key: string, _eid: number): OAppOmniGraphHardhat['connections'] {
    const conns = lzConfig.connections
    const connections: OAppOmniGraphHardhat['connections'] = []

    for (const conn of conns) {
        if (conn[_key].eid == _eid) {
            connections.push(conn)
        }
    }

    return connections
}
