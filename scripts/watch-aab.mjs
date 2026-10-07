// Monitor the requested EAS build and download its signed AAB, without store submission.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const buildId = process.argv[2];
if (!/^[a-f0-9-]{36}$/.test(buildId ?? '')) throw new Error('Pass the EAS build UUID');
const root = fileURLToPath(new URL('../', import.meta.url));
const artifactDir = resolve(root, 'artifacts');
await mkdir(artifactDir, { recursive: true });
const reportPath = join(artifactDir, `eas-build-${buildId}.json`);
const buildPage = `https://expo.dev/accounts/rembardino/projects/frame-it/builds/${buildId}`;
const query = `query($id:ID!){builds{byId(buildId:$id){id status appIdentifier appVersion appBuildVersion app{slug ownerAccount{name}} artifacts{buildUrl applicationArchiveUrl} error{message errorCode}}}}`;

async function readBuild() {
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.EXPO_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_TOKEN}`;
  else {
    const state = JSON.parse(await readFile(join(homedir(), '.expo', 'state.json'), 'utf8'));
    if (!state.auth?.sessionSecret) throw new Error('Expo login required');
    headers['Expo-Session'] = state.auth.sessionSecret;
  }
  const response = await fetch('https://api.expo.dev/graphql', {
    method: 'POST', headers,
    body: JSON.stringify({ query, variables: { id: buildId } }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Expo HTTP ${response.status}`);
  const result = await response.json();
  if (result.errors) throw new Error(result.errors.map(error => error.message).join('; '));
  const build = result.data.builds.byId;
  if (build.app.slug !== 'frame-it' || build.app.ownerAccount.name !== 'rembardino' || build.appIdentifier !== 'come.frameitnow') {
    throw new Error('Build project or package does not match Frame It');
  }
  return build;
}

let errors = 0;
while (true) {
  try {
    const build = await readBuild();
    errors = 0;
    const report = { buildId, buildPage, status: build.status, package: build.appIdentifier, version: build.appVersion, versionCode: build.appBuildVersion, checkedAt: new Date().toISOString(), error: build.error };
    if (build.status === 'FINISHED') {
      const url = build.artifacts.applicationArchiveUrl ?? build.artifacts.buildUrl;
      if (!url || new URL(url).protocol !== 'https:') throw new Error('Missing HTTPS build artifact');
      if (!/^[0-9]+(?:\.[0-9]+)*$/.test(build.appVersion) || !/^\d+$/.test(build.appBuildVersion)) throw new Error('Unexpected artifact version');
      const output = join(artifactDir, `frame-it-${build.appVersion}-${build.appBuildVersion}.aab`);
      const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
      if (!response.ok) throw new Error(`Artifact HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 1000 || bytes.readUInt32LE(0) !== 0x04034b50) throw new Error('Artifact is not an app-bundle ZIP');
      // Do not overwrite an existing file unless its contents already match exactly.
      try { await writeFile(output, bytes, { flag: 'wx' }); }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const previous = await readFile(output);
        if (!previous.equals(bytes)) throw new Error('Existing artifact differs; refusing overwrite');
      }
      let signatureVerified = false;
      let signatureCheckNote;
      try {
        const verification = execFileSync('jarsigner', ['-verify', output], { encoding: 'utf8', windowsHide: true });
        signatureVerified = verification.includes('jar verified');
        if (!signatureVerified) signatureCheckNote = 'Check jarsigner output manually';
      } catch { signatureCheckNote = 'Could not complete local jarsigner verification'; }
      Object.assign(report, { artifactUrl: url, localArtifact: output, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), signatureVerified, signatureCheckNote });
      await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
      console.log(JSON.stringify(report));
      break;
    }
    await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
    console.log(`${report.checkedAt}: ${build.status}`);
    if (['ERRORED', 'CANCELED'].includes(build.status)) {
      console.error(JSON.stringify(build.error));
      process.exitCode = 1;
      break;
    }
  } catch (error) {
    // Never log request headers, session secrets or account state.
    console.error(`Build monitor: ${error.message}`);
    if (++errors >= 5) { process.exitCode = 1; break; }
  }
  await new Promise(resolve => setTimeout(resolve, 45000));
}
