/**
 * Standard Coordinates Directory for Major Indian Hubs (GeoJSON: [longitude, latitude])
 */
export const CITY_COORDINATES = {
  lucknow: [80.9462, 26.8467],
  hazratganj: [80.9462, 26.8467],
  gomtinagar: [80.9992, 26.8524],
  aliganj: [80.9392, 26.8878],
  indiranagar: [80.9882, 26.8795],
  varanasi: [82.9739, 25.3176],
  banaras: [82.9739, 25.3176],
  kashi: [82.9739, 25.3176],
  kanpur: [80.3319, 26.4499],
  indore: [75.8577, 22.7196],
  prayagraj: [81.8463, 25.4358],
  allahabad: [81.8463, 25.4358],
  delhi: [77.2090, 28.6139],
  "delhi ncr": [77.2090, 28.6139],
  "new delhi": [77.2090, 28.6139],
  noida: [77.3910, 28.5355],
  "greater noida": [77.5040, 28.4744],
  ghaziabad: [77.4538, 28.6692],
  gurugram: [77.0266, 28.4595],
  gurgaon: [77.0266, 28.4595],
  gorakhpur: [83.3732, 26.7606],
  agra: [78.0081, 27.1767],
  ayodhya: [82.1998, 26.7922],
  faizabad: [82.1998, 26.7922],
  kolkata: [88.3639, 22.5726],
  jaipur: [75.7873, 26.9124],
  mumbai: [72.8777, 19.0760],
  bhopal: [77.4126, 23.2599],
  patna: [85.1376, 25.5941],
  bengaluru: [77.5946, 12.9716],
  bangalore: [77.5946, 12.9716],
  pune: [73.8567, 18.5204],
  hyderabad: [78.4867, 17.3850],
  ahmedabad: [72.5714, 23.0225],
  chandigarh: [76.7794, 30.7333],
};

/**
 * Resolves standard GeoJSON coordinates [longitude, latitude] for a given city or address string.
 * Defaults to Lucknow coordinates if no specific match is found.
 */
export const resolveCoordinatesForCity = (city = "", address = "") => {
  const cleanCity = String(city || "").trim().toLowerCase();
  for (const [key, coords] of Object.entries(CITY_COORDINATES)) {
    if (cleanCity.includes(key) || key.includes(cleanCity)) {
      return coords;
    }
  }

  const cleanAddr = String(address || "").trim().toLowerCase();
  for (const [key, coords] of Object.entries(CITY_COORDINATES)) {
    if (cleanAddr.includes(key)) {
      return coords;
    }
  }

  // Default to Lucknow center
  return [80.9462, 26.8467];
};
