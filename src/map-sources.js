import { ArcGisDemSource, TDTQMSource, TDTSource } from 'three-tile/plugin';

// 切换 DEM 只需修改此处：'arcgis' | 'tianditu'
export const DEM_PROVIDER = 'arcgis';

const demFactories = {
  arcgis: () => new ArcGisDemSource({
    projectionID: '3857',
    maxLevel: 13
  }),
  tianditu: (token) => new TDTQMSource({
    token,
    projectionID: '3857',
    maxLevel: 12
  })
};

export function createMapSources(token) {
  const createDemSource = demFactories[DEM_PROVIDER];
  if (!createDemSource) throw new Error(`不支持的 DEM 数据源：${DEM_PROVIDER}`);

  return {
    imageSource: new TDTSource({
      token,
      style: 'img_w',
      projectionID: '3857'
    }),
    demSource: createDemSource(token),
    demProvider: DEM_PROVIDER,
    demLabel: DEM_PROVIDER === 'arcgis' ? 'ArcGIS DEM' : '天地图 DEM'
  };
}
