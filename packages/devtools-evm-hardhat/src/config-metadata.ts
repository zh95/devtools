import type { OmniPointHardhat, OmniEdgeHardhat } from '.'
import type { OAppEnforcedOption, OAppEdgeConfig } from '@layerzerolabs/ua-devtools'

const METADATA_URL = 'https://metadata.layerzero-api.com/v1/metadata'

function getEndpointIdDeployment(eid: number, metadata: any) {
    const srcEidString = eid.toString()
    for (const objectKey in metadata) {
        const entry = metadata[objectKey]

        if (typeof entry.deployments !== 'undefined') {
            for (const deployment of entry.deployments) {
                if (srcEidString === deployment.eid) {
                    return deployment
                }
            }
        }
    }

    throw new Error(`Can't find endpoint with eid: "${eid}",`)
}

function DVNsToAddresses(dvns: string[], chainKey: string, metadata: any) {
    if (dvns.length === 0) {
        return []
    }

    if (dvns[0]?.includes('0x')) {
        return dvns.sort()
    }

    const dvnAddresses: string[] = []

    const metadataDVNs = Object.entries(metadata[chainKey].dvns)

    for (const dvn of dvns) {
        for (const [dvnAddress, dvnDetails] of metadataDVNs) {
            if ((dvnDetails as any).canonicalName === dvn && !(dvnDetails as any).lzReadCompatible) {
                dvnAddresses.push(dvnAddress)
                break
            }
        }
    }

    if (dvns.length !== dvnAddresses.length) {
        throw new Error(`Can't find all DVNs: "${dvns.join(', ')}",`)
    }

    return dvnAddresses.sort()
}

// [srcContract, dstContract, [requiredDVNs, [optionalDVNs, threshold]], [srcToDstConfirmations, dstToSrcConfirmations]], [enforcedOptionsSrcToDst, enforcedOptionsDstToSrc]
export type TwoWayConfig = [
    OmniPointHardhat,
    OmniPointHardhat,
    [string[], [string[], number] | []],
    [number, number | undefined],
    [OAppEnforcedOption[] | undefined, OAppEnforcedOption[] | undefined],
]

async function translatePathwayToConfig(
    pathway: TwoWayConfig,
    metadata: any
): Promise<OmniEdgeHardhat<OAppEdgeConfig | undefined>[]> {
    const configs: OmniEdgeHardhat<OAppEdgeConfig | undefined>[] = []

    const sourceContract = pathway[0]
    const destinationContract = pathway[1]
    const [requiredDVNs, optionalDVNConfig] = pathway[2]
    const [sourceToDestinationConfirmations, destinationToSourceConfirmations] = pathway[3]
    const [enforcedOptionsSrcToDst, enforcedOptionsDstToSrc] = pathway[4]

    const optionalDVNs = optionalDVNConfig[0]
    const optionalDVNThreshold = optionalDVNConfig[1] || 0

    if (optionalDVNThreshold > (optionalDVNs?.length || 0)) {
        throw new Error(`Optional DVN threshold is greater than the number of optional DVNs.`)
    }

    const sourceLZDeployment = getEndpointIdDeployment(sourceContract.eid, metadata)
    const destinationLZDeployment = getEndpointIdDeployment(destinationContract.eid, metadata)

    if (sourceLZDeployment.chainKey.startsWith('solana') || destinationLZDeployment.chainKey.startsWith('solana')) {
        throw new Error(
            'Solana is not supported in this version of the config generator. Use the "simple-config-generator.solana.ts" file instead.'
        )
    }

    const sourceRequiredDVNs = DVNsToAddresses(requiredDVNs, sourceLZDeployment.chainKey, metadata)
    const destinationRequiredDVNs = DVNsToAddresses(requiredDVNs, destinationLZDeployment.chainKey, metadata)

    let sourceOptionalDVNs: string[] = []
    let destinationOptionalDVNs: string[] = []

    if (optionalDVNs) {
        sourceOptionalDVNs = DVNsToAddresses(optionalDVNs, sourceLZDeployment.chainKey, metadata)
        destinationOptionalDVNs = DVNsToAddresses(optionalDVNs, destinationLZDeployment.chainKey, metadata)
    }

    const sourceToDestinationConfig: OmniEdgeHardhat<OAppEdgeConfig> = {
        from: sourceContract,
        to: destinationContract,
        config: {
            sendLibrary: sourceLZDeployment.sendUln302.address,
            receiveLibraryConfig: {
                receiveLibrary: sourceLZDeployment.receiveUln302.address,
                gracePeriod: BigInt(0),
            },
            sendConfig: {
                executorConfig: {
                    maxMessageSize: 10000,
                    executor: sourceLZDeployment.executor.address,
                },
                ulnConfig: {
                    confirmations: BigInt(sourceToDestinationConfirmations),
                    requiredDVNs: sourceRequiredDVNs,
                    optionalDVNs: sourceOptionalDVNs,
                    optionalDVNThreshold,
                },
            },
            enforcedOptions: enforcedOptionsSrcToDst,
        },
    }

    const destinationToSourceConfig: OmniEdgeHardhat<OAppEdgeConfig> = {
        from: destinationContract,
        to: sourceContract,
        config: {
            sendLibrary: destinationLZDeployment.sendUln302.address,
            receiveLibraryConfig: {
                receiveLibrary: destinationLZDeployment.receiveUln302.address,
                gracePeriod: BigInt(0),
            },
            receiveConfig: {
                ulnConfig: {
                    confirmations: BigInt(sourceToDestinationConfirmations),
                    requiredDVNs: destinationRequiredDVNs,
                    optionalDVNs: destinationOptionalDVNs,
                    optionalDVNThreshold,
                },
            },
        },
    }

    if (destinationToSourceConfirmations) {
        sourceToDestinationConfig.config.receiveConfig = {
            ulnConfig: {
                confirmations: BigInt(destinationToSourceConfirmations),
                requiredDVNs: sourceRequiredDVNs,
                optionalDVNs: sourceOptionalDVNs,
                optionalDVNThreshold,
            },
        }

        destinationToSourceConfig.config.enforcedOptions = enforcedOptionsDstToSrc

        destinationToSourceConfig.config.sendConfig = {
            executorConfig: {
                maxMessageSize: 10000,
                executor: destinationLZDeployment.executor.address,
            },
            ulnConfig: {
                confirmations: BigInt(destinationToSourceConfirmations),
                requiredDVNs: destinationRequiredDVNs,
                optionalDVNs: destinationOptionalDVNs,
                optionalDVNThreshold,
            },
        }
    }

    configs.push(sourceToDestinationConfig)
    configs.push(destinationToSourceConfig)

    return configs
}

export async function generateConnectionsConfig(pathways: TwoWayConfig[]) {
    const metadata = await fetch(METADATA_URL).then((res) => res.json())
    const connections: OmniEdgeHardhat<OAppEdgeConfig | undefined>[] = []

    for (const pathway of pathways) {
        connections.push(...(await translatePathwayToConfig(pathway, metadata)))
    }

    return connections
}
