import { ai, apiError, requireUser } from "@/lib/server";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    if (
      request.headers.get("origin") &&
      request.headers.get("origin") !== new URL(request.url).origin
    )
      return Response.json(
        { error: "허용되지 않은 요청입니다." },
        { status: 403 },
      );
    await requireUser();
    const client = ai();
    const data = await request.formData();
    const file = data.get("audio");
    if (!(file instanceof File) || !file.size)
      return Response.json(
        { error: "음성 파일을 선택하세요." },
        { status: 400 },
      );
    if (file.size > 24 * 1024 * 1024)
      return Response.json(
        {
          error:
            "24MB 이하의 파일을 사용하세요. 자동 분할은 아직 지원하지 않습니다.",
        },
        { status: 413 },
      );
    if (
      ![
        "audio/webm",
        "audio/mp4",
        "audio/mpeg",
        "audio/wav",
        "audio/x-wav",
        "audio/ogg",
        "audio/x-m4a",
      ].includes(file.type.split(";")[0])
    )
      return Response.json(
        { error: "지원하지 않는 오디오 형식입니다." },
        { status: 415 },
      );
    const transcript = await client.audio.transcriptions.create({
      file,
      model: process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-transcribe",
      language: "ko",
      prompt:
        "한국어 비즈니스 회의. HAL, MCM, KPI, OpenAI, ChatGPT, 플랫폼, 마케팅.",
    });
    return Response.json({ text: transcript.text });
  } catch (error) {
    return apiError(error);
  }
}
