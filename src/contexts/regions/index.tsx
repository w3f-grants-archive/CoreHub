import React, { createContext, useContext, useEffect, useState } from 'react';

import {
  countOne,
  getBlockTimestamp,
  parseHNString,
  stringifyOnChainId as stringifyOnChainRegionId,
} from '@/utils/functions';

import {
  HumanRegionId,
  HumanRegionRecord,
  OnChainRegionId,
  RegionMetadata,
  RegionOrigin,
  RELAY_CHAIN_BLOCK_TIME,
} from '@/models';

import { useCoretimeApi, useRelayApi } from '../apis';
import { ApiState } from '../apis/types';

interface RegionsData {
  regions: Array<RegionMetadata>;
  config: {
    timeslicePeriod: number;
  };
  loading: boolean;
  updateRegionName: (_index: number, _name: string) => void;
  fetchRegions: () => Promise<void>;
}
const defaultRegionData: RegionsData = {
  regions: [],
  config: {
    timeslicePeriod: 0,
  },
  loading: false,
  updateRegionName: () => {
    /** */
  },
  fetchRegions: async () => {
    /** */
  },
};

const RegionDataContext = createContext<RegionsData>(defaultRegionData);

interface Props {
  children: React.ReactNode;
}

const RegionDataProvider = ({ children }: Props) => {
  const {
    state: { api: coretimeApi, apiState: coretimeApiState },
  } = useCoretimeApi();
  const {
    state: { api: relayApi, apiState: relayApiState },
  } = useRelayApi();

  const [regions, setRegions] = useState<Array<RegionMetadata>>([]);
  const [timeslicePeriod, setTimeslicePeriod] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  const apisConnected =
    coretimeApi &&
    coretimeApiState === ApiState.READY &&
    relayApi &&
    relayApiState === ApiState.READY;

  const fetchRegions = async (): Promise<void> => {
    if (!apisConnected) {
      setRegions([]);
      return;
    }

    setLoading(true);
    const timeslicePeriod = parseHNString(
      coretimeApi.consts.broker.timeslicePeriod.toString()
    );
    const _regions: Array<RegionMetadata> = [];
    const res = await coretimeApi.query.broker.regions.entries();
    for await (const [key, value] of res) {
      const [regionId] = key.toHuman() as [HumanRegionId];
      const regionData = value.toHuman() as HumanRegionRecord;

      const { begin, core, mask } = regionId;
      const { end, owner, paid } = regionData;

      const beginBlockHeight = timeslicePeriod * parseHNString(begin);
      const tsBegin = await getBlockTimestamp(relayApi, beginBlockHeight); // begin block timestamp

      // rough estimation
      const endBlockHeight = timeslicePeriod * parseHNString(end);
      const tsEnd =
        tsBegin + (endBlockHeight - beginBlockHeight) * RELAY_CHAIN_BLOCK_TIME;

      const nPaid = paid ? parseHNString(paid) : undefined;
      const rawId: OnChainRegionId = {
        begin: parseHNString(begin),
        core,
        mask,
      };
      const name = localStorage.getItem(
        `region-${stringifyOnChainRegionId(rawId)}`
      );

      _regions.push({
        begin: tsBegin,
        core,
        mask,
        end: tsEnd,
        owner,
        paid: nPaid,
        origin: RegionOrigin.CORETIME_CHAIN,
        rawId,
        name: name ?? `Region #${_regions.length + 1}`,
        ownership: countOne(mask) / timeslicePeriod,
      });
    }
    setRegions([..._regions]);
    setLoading(false);
  };

  useEffect(() => {
    if (!apisConnected) return;
    const timeslicePeriod = parseHNString(
      coretimeApi.consts.broker.timeslicePeriod.toString()
    );
    setTimeslicePeriod(timeslicePeriod);
    fetchRegions();
  }, [apisConnected]);

  const updateRegionName = (index: number, name: string) => {
    const _regions = [...regions];
    const region = regions[index];
    _regions[index] = {
      ...region,
      name,
    };
    setRegions(_regions);
    localStorage.setItem(
      `region-${stringifyOnChainRegionId(region.rawId)}`,
      name
    );
  };

  return (
    <RegionDataContext.Provider
      value={{
        regions,
        config: { timeslicePeriod },
        loading,
        updateRegionName,
        fetchRegions,
      }}
    >
      {children}
    </RegionDataContext.Provider>
  );
};

const useRegions = () => useContext(RegionDataContext);

export { RegionDataProvider, useRegions };