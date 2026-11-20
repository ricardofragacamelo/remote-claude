/**
 * Reading `/search/text`, `/search/replace/preview` and every other D-02 NDJSON stream, from the
 * outside — one `JSON.parse` per line, in the order the server wrote them.
 */

/** Every line of an NDJSON response, parsed — the response is already settled by the time `fetch` resolves. */
export async function ndjsonLines<T>(response: Response): Promise<T[]> {
  const body = await response.text();

  return body
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as T);
}
