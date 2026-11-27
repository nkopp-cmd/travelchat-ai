// Search Console targets with visible guide details that can answer a specific search.
const snippets = new Map([
  ["5558e39d-7b2d-4a94-a819-e0993022637d", {
    title: "Sumiya Pleasure House, Kyoto: Museum Guide",
    description: "Visit Sumiya Pleasure House in Kyoto’s Shimabara district. See the historic banquet rooms and learn how to reserve the guided tour of the second floor.",
  }],
  ["5c9d082a-2a4c-45ba-a8ea-fbf860cb0194", {
    title: "Sengkang Riverside Park: Wetland Walk",
    description: "Walk the wetland paths at Sengkang Riverside Park in Singapore. Find the bridge across the Punggol River and directions from Kupang LRT.",
  }],
  ["1bd9ec9e-8f7f-4ebc-ba54-9451db55ed3f", {
    title: "Bukit Batok Nature Park: Quarry Walk",
    description: "Walk to the old granite quarry at Bukit Batok Nature Park in Singapore. Allow one to two hours for the forest paths and the World War II memorial.",
  }],
]);

export function spotSearchSnippet(id: string) {
  return snippets.get(id);
}
