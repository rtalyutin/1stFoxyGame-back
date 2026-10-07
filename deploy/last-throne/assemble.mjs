import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SOURCE_HASH, RELEASE_ID, RELEASE_HASHES, BACK_DIRS, BACK_FILES, cleanPath, existingDirectory, noSymlinkPath, freshOutput, publishFreshDirectory, inventory, pairedSourceHash, exactReleases, parseArgs } from './lib.mjs';

export async function assemble({ backSource, frontWeb, readyRoot, output, expectedSourceHash = SOURCE_HASH, expectedArchives = RELEASE_HASHES }) {
  if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('Node 24 is required');
  const back = await existingDirectory(cleanPath(backSource, 'back source'));
  const web = await existingDirectory(cleanPath(frontWeb, 'front web'));
  const ready = await existingDirectory(cleanPath(readyRoot, 'ready root'));
  const target = cleanPath(output, 'output');
  await freshOutput(target, [back, web, ready]);
  if (await pairedSourceHash(back, web) !== expectedSourceHash) throw new Error('Paired sourceHash mismatch; canonical source does not match the selected R3');
  // The verifier itself is covered by the accepted sourceHash before importing it.
  const { verifyRelease } = await import(pathToFileURL(path.join(back, 'ops/artifacts.mjs')).href);
  const before = await exactReleases(ready, verifyRelease, expectedArchives);
  if (before[RELEASE_ID]?.sourceHash !== expectedSourceHash) throw new Error('R3 archive and paired sources have different sourceHash');
  for (const dir of BACK_DIRS) await inventory(path.join(back, dir));
  for (const file of BACK_FILES) await noSymlinkPath(path.join(back, file));
  await mkdir(path.dirname(target), { recursive: true });
  const parent = await mkdtemp(path.join(path.dirname(target), '.td-assembling-'));
  const stage = path.join(parent, 'workspace');
  try {
    await mkdir(stage);
    for (const dir of BACK_DIRS) await cp(path.join(back, dir), path.join(stage, dir), { recursive: true, dereference: false });
    for (const name of BACK_FILES) await cp(path.join(back, name), path.join(stage, name), { dereference: false });
    await cp(web, path.join(stage, 'web'), { recursive: true, dereference: false });
    await mkdir(path.join(stage, 'releases'));
    for (const id of Object.keys(expectedArchives)) await cp(path.join(ready, 'releases', id), path.join(stage, 'releases', id), { recursive: true, dereference: false });
    if (await pairedSourceHash(stage, path.join(stage, 'web')) !== expectedSourceHash) throw new Error('Copied sourceHash mismatch');
    await exactReleases(stage, verifyRelease, expectedArchives);
    if (await pairedSourceHash(back, web) !== expectedSourceHash) throw new Error('Source changed during assembly');
    await exactReleases(ready, verifyRelease, expectedArchives);
    const evidence = { status: 'LOCAL_ASSEMBLY_VERIFIED', sourceHash: expectedSourceHash, canonicalBack: back, canonicalWeb: web,
      archives: Object.fromEntries(Object.entries(before).map(([id, m]) => [id, { manifestSha256: expectedArchives[id], files: Object.keys(m.files).length }])),
      deploy: 'NOT_STARTED', note: 'Generated workspace. Edit canonical repository sources, never this copy.' };
    await writeFile(path.join(stage, 'ASSEMBLY.json'), JSON.stringify(evidence, null, 2) + '\n');
    await writeFile(path.join(stage, '.gitignore'), '*\n');
    await writeFile(path.join(stage, 'GENERATED.md'), '# Generated workspace\n\nDo not edit or commit this directory. Canonical core lives only in the backend repository; web lives only in the frontend repository. Re-run the assembler from those sources.\n');
    // The destination must still be fresh at the point of publication.
    await publishFreshDirectory(stage, target, [back, web, ready]);
    return { ...evidence, directory: target };
  } finally { await rm(parent, { recursive: true, force: true }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = parseArgs(process.argv.slice(2), ['--back-source', '--front-web', '--ready-root', '--output']);
    const backSource = args['--back-source'] ?? fileURLToPath(new URL('../../games/last-throne/', import.meta.url));
    console.log(JSON.stringify(await assemble({ backSource, frontWeb: args['--front-web'], readyRoot: args['--ready-root'], output: args['--output'] }), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
