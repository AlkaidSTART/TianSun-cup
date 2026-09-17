export const WORLD_SPEC = {
  version: '1.0',
  title: 'Aba-Ganzi Highland Pasture',
  qualityTier: 'production',
  seed: 7319,
  explicitConstraints: [
    'Sichuan Aba and Ganzi plateau pasture reference',
    'absolute elevation 3000-4000 m',
    'relative relief 100-200 m',
    'gentle 5-20 degree terrain slopes',
    'yellow-green and light-brown meadow soil palette',
    'low vegetation on gentle slopes',
    'multiple winding seasonal streams',
    'small white pastoral tents for scale'
  ],
  inferredDetails: [
    '220 m square working world with 180 by 180 samples',
    'four blended semantic regions',
    'late-afternoon clear weather and cool mountain haze',
    'deterministic scatter rejection based on slope and water proximity',
    'three procedural PBR texture layers with slope-driven blending',
    'local CanvasTexture environment map and terrain-following water ribbons'
  ],
  world: {
    size: 220,
    resolution: 180,
    elevationMeters: [3000, 4000],
    reliefMeters: [100, 200],
    slopeDegrees: [5, 20],
    waterLevel: 0
  },
  regions: [
    { id: 'meadow-north', label: 'North Meadow', center: [0, -0.46], radius: 0.68, role: 'open grazing' },
    { id: 'river-valley', label: 'River Valley', center: [-0.08, 0.08], radius: 0.5, role: 'seasonal watercourse' },
    { id: 'sunny-hills', label: 'Sunny Hills', center: [0.44, 0.26], radius: 0.58, role: 'dry meadow and soil' },
    { id: 'south-slope', label: 'South Slope', center: [-0.46, 0.48], radius: 0.62, role: 'rolling upland' }
  ],
  landmarks: [
    { id: 'camp-east', type: 'pastoral-tent', position: [42, 0, -38], scale: 1.0 },
    { id: 'camp-valley', type: 'pastoral-tent', position: [-28, 0, 12], scale: 0.82 },
    { id: 'camp-south', type: 'pastoral-tent', position: [6, 0, 58], scale: 0.72 },
    { id: 'camp-west', type: 'pastoral-tent', position: [-65, 0, -8], scale: 0.68 }
  ],
  streams: [
    { id: 'main-seasonal-creek', width: 1.45, points: [[-102, -0.5, -38], [-76, -1.0, -18], [-48, -1.5, -8], [-20, -2.0, 5], [4, -1.5, 18], [32, -1.0, 35], [68, -0.3, 48], [108, 0, 57]] },
    { id: 'meadow-feeder', width: 0.82, points: [[-18, 0.3, -108], [-12, -0.1, -76], [-10, -0.8, -48], [-4, -1.5, -18], [-2, -1.6, 8]] },
    { id: 'east-feeder', width: 0.7, points: [[106, 0, -82], [78, -0.2, -58], [60, -0.6, -32], [43, -0.9, -10], [32, -1.0, 10]] }
  ]
};
