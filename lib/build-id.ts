// Which deploy is serving this request. Fly gives every machine of one deploy
// the same FLY_IMAGE_REF; a local server is one build, "local".
export function currentBuild(): string {
  return process.env.FLY_IMAGE_REF || 'local'
}
