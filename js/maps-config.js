// maps-config.js — V14: Google Maps Platform settings for the helicopter world (Photorealistic 3D Tiles, Map Tiles API).
// The key is a browser key: it is visible to every visitor by design. Protect it in Google Cloud Console:
//   Application restrictions → Websites: https://yosmosllc.com/* and https://www.yosmosllc.com/*
//   API restrictions → Map Tiles API only.
// Set GOOGLE_3D_ENABLED to false (or the key to '') to switch the helicopter world back to the classic USGS / OSM city.
// No side effects on import. Never log the key.
export const GOOGLE_MAPS_API_KEY = 'AIzaSyCHgOe-pPX_LfL55bMqher0fP77McLCzL4';
export const GOOGLE_3D_ENABLED = true;
export default { GOOGLE_MAPS_API_KEY, GOOGLE_3D_ENABLED };
