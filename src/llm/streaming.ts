export async function collectStream(stream: AsyncGenerator<string>): Promise<string> {
  let output = "";
  for await (const chunk of stream) {
    output += chunk;
  }
  return output;
}
