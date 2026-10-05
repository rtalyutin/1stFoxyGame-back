import { parseContentProjection as parseR1Content } from '../core/content-r1.ts';
import { validateSnapshot as validateR1Snapshot } from '../core/game-core.ts';
import { parseContentProjection as parseR2Content } from '../core/content-r2.ts';
import { validateSnapshot as validateR2Snapshot } from '../core/game-core-r2.ts';

const runtimes = [
  { stage: 'R1', core: 'r1-core-1', metadataSchema: 'r1-meta-1', saveFormat: 2, contentPrefix: 'r1-content-', parseContent: parseR1Content, validateSnapshot: validateR1Snapshot },
  { stage: 'R2', core: 'r2-core-1', metadataSchema: 'r2-meta-1', saveFormat: 3, contentPrefix: 'r2-content-', parseContent: parseR2Content, validateSnapshot: validateR2Snapshot },
];

function runtimeForPins({ core, content, metadataSchema, saveFormat, api = 1 }) {
  return runtimes.find(runtime => core === runtime.core && metadataSchema === runtime.metadataSchema
    && saveFormat === runtime.saveFormat && api === 1 && typeof content === 'string' && content.startsWith(runtime.contentPrefix)) ?? null;
}

export const runtimeForManifest = manifest => runtimeForPins(manifest.versions);
export const runtimeForRun = run => runtimeForPins({ core: run.coreVersion, content: run.contentVersion,
  metadataSchema: run.metadataSchemaVersion, saveFormat: run.snapshotSchemaVersion });
export const technicalManifest = manifest => manifest.versions.saveFormat === 1
  && manifest.versions.core.startsWith('r0-core-') && manifest.versions.metadataSchema.startsWith('r0-meta-');
