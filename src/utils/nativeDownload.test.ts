import assert from 'node:assert/strict';
import test from 'node:test';
import { saveBlobToDevice, splitIntoChunkRanges, type NTKAndroidBridge } from './nativeDownload';

test('splitIntoChunkRanges divides exact and partial trailing chunks cleanly', () => {
  assert.deepEqual(splitIntoChunkRanges(0, 1024), []);
  assert.deepEqual(splitIntoChunkRanges(1000, 400), [
    { start: 0, end: 400 },
    { start: 400, end: 800 },
    { start: 800, end: 1000 },
  ]);
  assert.deepEqual(splitIntoChunkRanges(800, 400), [
    { start: 0, end: 400 },
    { start: 400, end: 800 },
  ]);
});

test('saveBlobToDevice streams encoded chunks through NTKAndroidBridge and finalizes cleanly', async () => {
  const receivedChunks: string[] = [];
  let finishedId: string | null = null;

  const mockBridge: NTKAndroidBridge = {
    beginSaveFile: (filename, mimeType) => {
      assert.equal(filename, 'recording.mp4');
      assert.equal(mimeType, 'video/mp4');
      return 'tx-1';
    },
    appendSaveFileChunk: (transferId, base64Chunk) => {
      assert.equal(transferId, 'tx-1');
      receivedChunks.push(base64Chunk);
      return true;
    },
    finishSaveFile: (transferId) => {
      finishedId = transferId;
      return 'Downloads/NTK Cam Studio/recording.mp4';
    },
  };

  const payload = new Uint8Array([78, 84, 75, 45, 67, 65, 77]);
  const blob = new Blob([payload], { type: 'video/mp4' });
  const result = await saveBlobToDevice(blob, 'recording.mp4', mockBridge);

  assert.equal(finishedId, 'tx-1');
  assert.equal(result.savedPath, 'Downloads/NTK Cam Studio/recording.mp4');
  assert.equal(receivedChunks.length, 1);
  assert.deepEqual(Array.from(Buffer.from(receivedChunks[0], 'base64')), Array.from(payload));
});

test('saveBlobToDevice aborts bridge transfer when chunk write fails', async () => {
  let abortedId: string | null = null;

  const failingBridge: NTKAndroidBridge = {
    beginSaveFile: () => 'tx-fail',
    appendSaveFileChunk: () => false,
    finishSaveFile: () => 'should-not-run',
    abortSaveFile: (id) => {
      abortedId = id;
    },
  };

  const blob = new Blob(['hello world'], { type: 'text/plain' });
  await assert.rejects(
    () => saveBlobToDevice(blob, 'fail.txt', failingBridge),
    /Failed while writing file chunk/
  );
  assert.equal(abortedId, 'tx-fail');
});
