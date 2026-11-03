export async function publicJson(
  url: string,
  headers?: HeadersInit,
): Promise<unknown> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const work = (async () => {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
      cache: "no-store",
      redirect: "error",
    });
    if (!response.ok) throw Error(`HTTP ${response.status}`);
    const reader = response.body?.getReader();
    if (!reader) throw Error("빈 응답");
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8_000_000) {
        await reader.cancel();
        throw Error("응답 크기 제한");
      }
      chunks.push(value);
    }
    const merged = new Uint8Array(size);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.length;
    }
    return JSON.parse(new TextDecoder().decode(merged)) as unknown;
  })();
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(Error("제공자 시간 초과"));
        }, 8000);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}
