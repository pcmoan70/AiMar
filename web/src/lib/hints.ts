// Hint texts live in src/i18n/{en,nb}.ts under 'hint.<key>'; this file keeps the key type.
export type HintKey =
  | 'loknr' | 'status' | 'capacity' | 'species' | 'operators' | 'purpose' | 'productionForm' | 'placement'
  | 'municipality' | 'prodArea' | 'clearance' | 'latestLice' | 'last52' | 'liceChart' | 'liceChartAll'
  | 'liceChartOperators' | 'position' | 'nearestFarm' | 'licePressure' | 'neighbours' | 'operatorSites'
  | 'operatorColours' | 'storage' | 'cacheCounts' | 'cacheLimit' | 'tileCount' | 'snapshot'
  | 'liceMean' | 'liceMax' | 'liceAbove' | 'liceTreat' | 'cases' | 'casesPanel' | 'treatmentHeat' | 'heatRadius' | 'tides' | 'liceWeek' | 'liceHeat' | 'seasonWeek' | 'warmSites' | 'climMonth' | 'application'
