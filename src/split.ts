export function splitCode(code: string): string[] {
    const chunks: string[] = [];
    const lines = code.split('\n');
    let currentChunk = '';
    let chunkCount = 0;
    let nestingCount = 0;
    let inNest = false;
  
    for (const line of lines) {
      currentChunk += line + '\n';
  
      if (currentChunk.split(' ').length > 2000 || currentChunk.length > 4000) {
        chunks.push(currentChunk);
        currentChunk = '';
        chunkCount++;
      }
  
      if (line.includes('{')) {
        nestingCount++;
        inNest = true;
      }
  
      if (line.includes('}')) {
        nestingCount--;
      }
  
      if (nestingCount === 0 && currentChunk !== '' && inNest) {
        chunks.push(currentChunk);
        currentChunk = '';
        chunkCount++;
        inNest = false;
      }
    }
  
    if (currentChunk.trim() !== '' && currentChunk !== '') {
      chunks.push(currentChunk);
      chunkCount++;
    }
  
    console.log(`Split ${chunkCount} chunks.`, chunks);
  
    return chunks;
  }
  