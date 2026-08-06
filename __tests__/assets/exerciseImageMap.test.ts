import fs from 'node:fs';
import path from 'node:path';

import { exerciseImageMap, exerciseImageFilenameCount } from '../../assets/exercises/imageMap';
import { getExerciseImageSource } from '../../assets/exercises/index';

/**
 * jest-expo's default asset transform resolves each `require('./<file>.webp')`
 * in imageMap.ts to a numeric module id rather than throwing - the same
 * resolution Metro performs for a real app bundle. A successful import of this
 * generated module is itself evidence that every one of its 1,721 literal
 * require() calls is statically resolvable, which is the whole point of
 * generating it instead of doing a runtime `require(variablePath)` lookup.
 */
describe('exercise image map', () => {
  it('has one entry per file actually bundled under assets/exercises/', () => {
    const bundledFilenames = fs
      .readdirSync(path.join(__dirname, '../../assets/exercises'))
      .filter((name) => name.endsWith('.webp'));

    expect(exerciseImageFilenameCount).toBe(bundledFilenames.length);
    expect(Object.keys(exerciseImageMap)).toHaveLength(bundledFilenames.length);
  });

  it('resolves a known filename to a defined image source', () => {
    const knownFilename = '0000dcf36b9b4fce.webp';

    expect(exerciseImageMap[knownFilename]).toBeDefined();
    expect(getExerciseImageSource(knownFilename)).toBeDefined();
  });

  it('returns undefined for an unknown or missing filename', () => {
    expect(getExerciseImageSource('does-not-exist.webp')).toBeUndefined();
    expect(getExerciseImageSource(undefined)).toBeUndefined();
    expect(getExerciseImageSource(null)).toBeUndefined();
  });
});
