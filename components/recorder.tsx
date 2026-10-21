"use client";
import { useEffect, useRef, useState } from "react";
import {
  Mic,
  Pause,
  Play,
  Square,
  Upload,
  FileAudio,
  Sparkles,
  Download,
  Plus,
  Trash2,
  Search,
  Save,
} from "lucide-react";
import { browserDb, cloudConfigured } from "@/lib/supabase";
import type { Data, Meeting } from "@/lib/types";
import { download } from "./workspace";
type SavedAudio = { id: string; title: string; storage_path: string };
export default function Recorder({
  data,
  mutate,
  onError,
  onAddTask,
}: {
  data: Data;
  mutate: (
    table: keyof Data,
    row: Record<string, unknown>,
    remove?: boolean,
  ) => Promise<boolean>;
  onError: (s: string) => void;
  onAddTask: (s: string) => void;
}) {
  const [state, setState] = useState<"idle" | "recording" | "paused">("idle"),
    [seconds, setSeconds] = useState(0),
    [file, setFile] = useState<File | null>(null),
    [audioUrl, setAudioUrl] = useState(""),
    [consent, setConsent] = useState(false),
    [transcript, setTranscript] = useState(""),
    [title, setTitle] = useState("새 회의 기록"),
    [summary, setSummary] = useState(""),
    [items, setItems] = useState<Meeting["action_items"]>([]),
    [busy, setBusy] = useState(""),
    [warning, setWarning] = useState(""),
    [selected, setSelected] = useState<string | null>(null),
    [search, setSearch] = useState(""),
    [audios, setAudios] = useState<SavedAudio[]>([]);
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    chunks = useRef<Blob[]>([]),
    size = useRef(0);
  useEffect(() => {
    if (state === "idle") return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state]);
  useEffect(() => {
    if (state !== "recording") return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [state]);
  useEffect(() => {
    const handle = () => {
      if (document.hidden && recorder.current?.state === "recording") {
        recorder.current.pause();
        setState("paused");
        setWarning(
          "화면이 가려져 녹음을 일시정지했습니다. 이 브라우저에서는 잠금·백그라운드 녹음을 보장하지 않습니다. 돌아온 뒤 재개하세요.",
        );
      }
    };
    document.addEventListener("visibilitychange", handle);
    return () => {
      document.removeEventListener("visibilitychange", handle);
      if (recorder.current?.state !== "inactive") recorder.current?.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  useEffect(() => {
    if (!file) {
      setAudioUrl("");
      return;
    }
    const url = URL.createObjectURL(file);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (!cloudConfigured) return;
    void browserDb()
      .from("recordings")
      .select("id,title,storage_path")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setAudios(data);
      });
  }, []);
  async function start() {
    try {
      if (!consent) throw new Error("참석자의 녹음 동의를 먼저 확인하세요.");
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw new Error(
          "이 브라우저에서는 녹음할 수 없습니다. HTTPS 환경에서 열거나 음성 파일을 업로드하세요.",
        );
      if (file && !confirm("현재 저장하지 않은 음성을 새 녹음으로 바꿀까요?"))
        return;
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find(
        (m) => MediaRecorder.isTypeSupported(m),
      );
      recorder.current = new MediaRecorder(
        stream.current,
        mime ? { mimeType: mime } : undefined,
      );
      chunks.current = [];
      size.current = 0;
      setSeconds(0);
      setWarning("");
      setFile(null);
      const r = recorder.current;
      r.ondataavailable = (e) => {
        if (e.data.size) {
          chunks.current.push(e.data);
          size.current += e.data.size;
          if (size.current >= 22 * 1024 * 1024 && r.state !== "inactive") {
            r.stop();
            setWarning(
              "안전한 파일 크기를 위해 녹음을 종료했습니다. 다음 녹음을 별도 파일로 진행하세요.",
            );
          }
        }
      };
      r.onstop = () => {
        const ext = r.mimeType.includes("mp4") ? "m4a" : "webm";
        setFile(
          new File(chunks.current, `회의-${Date.now()}.${ext}`, {
            type: r.mimeType,
          }),
        );
        stream.current?.getTracks().forEach((t) => t.stop());
        setState("idle");
      };
      r.onerror = () => {
        onError("녹음 중 오류가 발생했습니다. 저장된 부분을 확인해 주세요.");
        if (r.state !== "inactive") r.stop();
      };
      r.start(1000);
      setState("recording");
    } catch (e) {
      stream.current?.getTracks().forEach((t) => t.stop());
      onError(e instanceof Error ? e.message : "마이크 권한을 확인해 주세요.");
    }
  }
  async function transcribe() {
    if (!file) return;
    if (file.size > 24 * 1024 * 1024) {
      onError(
        "24MB 이하의 파일을 사용해 주세요. 긴 파일의 자동 분할은 아직 제공하지 않습니다.",
      );
      return;
    }
    if (!confirm("이 음성 파일을 OpenAI로 전송하여 텍스트로 변환할까요?"))
      return;
    setBusy("transcribe");
    try {
      const body = new FormData();
      body.set("audio", file);
      const res = await fetch("/api/transcribe", { method: "POST", body });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error);
      setTranscript(out.text);
    } catch (e) {
      onError(e instanceof Error ? e.message : "변환 실패");
    } finally {
      setBusy("");
    }
  }
  async function summarize() {
    if (!transcript.trim()) return;
    if (!confirm("녹취록을 OpenAI로 전송해 회의록을 생성할까요?")) return;
    setBusy("summary");
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "meeting", transcript }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error);
      setTitle(out.title);
      setSummary(out.summary);
      setItems(out.action_items);
    } catch (e) {
      onError(e instanceof Error ? e.message : "회의록 생성 실패");
    } finally {
      setBusy("");
    }
  }
  async function saveAudio() {
    if (!file || !cloudConfigured) return;
    setBusy("save");
    let uploadedPath: string | null = null;
    try {
      const db = browserDb();
      const {
        data: { user },
      } = await db.auth.getUser();
      if (!user) throw new Error("로그인 후 음성을 저장할 수 있습니다.");
      const path = `${user.id}/${crypto.randomUUID()}.${file.type.includes("mp4") ? "m4a" : file.type.includes("mpeg") ? "mp3" : "webm"}`;
      const { error } = await db.storage
        .from("recordings")
        .upload(path, file, { contentType: file.type.split(";")[0] });
      if (error) throw error;
      uploadedPath = path;
      const result = await db
        .from("recordings")
        .insert({
          user_id: user.id,
          title,
          storage_path: path,
          duration_seconds: seconds,
        })
        .select("id,title,storage_path")
        .single();
      if (result.error) throw result.error;
      setAudios((a) => [result.data, ...a]);
      setWarning("음성 파일을 비공개 스토리지에 저장했습니다.");
    } catch (e) {
      if (uploadedPath)
        await browserDb().storage.from("recordings").remove([uploadedPath]);
      onError(e instanceof Error ? e.message : "음성 저장 실패");
    } finally {
      setBusy("");
    }
  }
  async function openAudio(a: SavedAudio) {
    const { data, error } = await browserDb()
      .storage.from("recordings")
      .createSignedUrl(a.storage_path, 300);
    if (error) {
      onError(error.message);
      return;
    }
    setFile(null);
    setAudioUrl(data.signedUrl);
  }
  async function deleteAudio(a: SavedAudio) {
    if (!confirm("원본 음성 파일을 영구 삭제할까요?")) return;
    const db = browserDb();
    const { error } = await db.storage
      .from("recordings")
      .remove([a.storage_path]);
    if (error) {
      onError(error.message);
      return;
    }
    const result = await db.from("recordings").delete().eq("id", a.id);
    if (result.error) {
      onError(result.error.message);
      return;
    }
    setAudios((list) => list.filter((v) => v.id !== a.id));
    setAudioUrl("");
  }
  return (
    <div className="record-grid">
      <div>
        <section className="panel recorder">
          <span className="ai-label">
            <Mic size={15} /> MEETING RECORDER
          </span>
          <h2>놓치지 않는 대화.</h2>
          <p>회의를 녹음하거나 기존 음성 파일을 업로드하세요.</p>
          <label className="consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            회의 참석자의 녹음·처리 동의를 확인했습니다.
          </label>
          <div
            className={
              "record-orb " + (state === "recording" ? "recording" : "")
            }
          >
            <Mic size={37} />
          </div>
          <div className="record-time">
            {String(Math.floor(seconds / 60)).padStart(2, "0")}
            <span>:</span>
            {String(seconds % 60).padStart(2, "0")}
          </div>
          <small>
            {state === "recording"
              ? "녹음 중"
              : state === "paused"
                ? "일시정지"
                : "녹음을 시작할 준비가 되었어요"}
          </small>
          <div className="record-actions">
            {state === "idle" ? (
              <button
                className="primary"
                onClick={start}
                disabled={!consent || !!busy}
              >
                <Mic size={17} />
                녹음 시작
              </button>
            ) : (
              <>
                <button
                  className="outline"
                  onClick={() => {
                    if (state === "recording") {
                      recorder.current?.pause();
                      setState("paused");
                    } else {
                      recorder.current?.resume();
                      setState("recording");
                    }
                  }}
                >
                  {state === "recording" ? (
                    <Pause size={17} />
                  ) : (
                    <Play size={17} />
                  )}{" "}
                  {state === "recording" ? "일시정지" : "재개"}
                </button>
                <button
                  className="primary"
                  onClick={() => recorder.current?.stop()}
                >
                  <Square size={16} />
                  녹음 종료
                </button>
              </>
            )}
            <label
              className={
                "outline file-upload " + (state !== "idle" ? "disabled" : "")
              }
            >
              <Upload size={16} />
              파일 업로드
              <input
                type="file"
                accept="audio/*"
                disabled={state !== "idle" || !!busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    if (f.size > 24 * 1024 * 1024) {
                      onError(
                        "24MB 이하의 파일을 선택하세요. 자동 분할은 아직 지원하지 않습니다.",
                      );
                      return;
                    }
                    setFile(f);
                    setSeconds(0);
                  }
                }}
              />
            </label>
          </div>
          <p className="muted">
            화면 잠금·백그라운드 녹음은 지원하지 않습니다.
            <br />
            24MB 이하 파일 지원 · 긴 녹음은 별도 파일로 나누어 진행하세요.
          </p>
          {warning && (
            <div className="mode-notice" role="status">
              {warning}
            </div>
          )}
          {audioUrl && (
            <div className="audio-preview">
              <span>
                <FileAudio size={17} />
                {file?.name || "저장된 음성"}
              </span>
              <audio controls src={audioUrl} />
              <div className="heading-actions">
                {file && (
                  <>
                    <button
                      className="outline"
                      disabled={!!busy}
                      onClick={transcribe}
                    >
                      {busy === "transcribe"
                        ? "텍스트 변환 중…"
                        : "텍스트 변환"}
                    </button>
                    <a className="outline" href={audioUrl} download={file.name}>
                      <Download size={14} />
                      파일 저장
                    </a>
                    {cloudConfigured && (
                      <button
                        className="outline"
                        disabled={!!busy}
                        onClick={saveAudio}
                      >
                        클라우드 저장
                      </button>
                    )}
                  </>
                )}
                <button
                  className="danger"
                  onClick={() => {
                    if (confirm("현재 음성을 지울까요?")) {
                      setFile(null);
                      setAudioUrl("");
                    }
                  }}
                >
                  현재 음성 지우기
                </button>
              </div>
            </div>
          )}
        </section>
        <section className="panel transcript-panel">
          <div className="section-heading compact">
            <h2>녹취록</h2>
            <span className="tag">직접 수정 가능</span>
          </div>
          <input
            className="meeting-title"
            aria-label="회의 제목"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            aria-label="녹취록"
            placeholder="음성을 텍스트로 변환하거나, 회의 내용을 직접 입력하세요. API 키가 없어도 기록을 저장할 수 있습니다."
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={9}
          />
          <div className="heading-actions">
            <button
              className="primary"
              onClick={summarize}
              disabled={!transcript.trim() || !!busy}
            >
              <Sparkles size={15} />
              {busy === "summary" ? "회의록 생성 중…" : "AI 회의록 생성"}
            </button>
            <button
              className="outline"
              disabled={!title.trim() || !!busy}
              onClick={async () => {
                const id = selected || crypto.randomUUID();
                if (
                  await mutate("meeting_notes", {
                    id,
                    title,
                    transcript,
                    summary,
                    action_items: items,
                    project_id:
                      data.meeting_notes.find((n) => n.id === id)?.project_id ||
                      null,
                  })
                ) {
                  setSelected(id);
                  setWarning("회의 기록을 저장했습니다.");
                }
              }}
            >
              <Save size={15} />
              기록 저장
            </button>
          </div>
          {summary && (
            <>
              <h3>회의록</h3>
              <textarea
                aria-label="회의록 수정"
                rows={12}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
              />
              <button
                className="outline"
                onClick={() =>
                  download(
                    title + ".md",
                    `# ${title}\n\n${summary}\n\n## 녹취록\n${transcript}`,
                  )
                }
              >
                <Download size={15} />
                Markdown 내보내기
              </button>
            </>
          )}
          {items.length > 0 && (
            <div className="action-items">
              <h3>
                후속 실행 과제 <span className="tag">확인 후 등록</span>
              </h3>
              {items.map((a, i) => (
                <div className="action-item" key={i}>
                  <div>
                    <strong>{a.title}</strong>
                    <small>
                      {a.owner || "담당자 확인 필요"} ·{" "}
                      {a.due_date || "마감일 확인 필요"}
                    </small>
                  </div>
                  <button
                    className="outline"
                    onClick={() => onAddTask(a.title)}
                  >
                    <Plus size={14} />
                    업무에 추가
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      <aside>
        <section className="panel settings-card">
          <h2>저장된 회의</h2>
          <div className="search">
            <Search size={15} />
            <input
              aria-label="회의 검색"
              value={search}
              placeholder="회의 제목 검색"
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {data.meeting_notes
            .filter((n) => n.title.includes(search))
            .map((n) => (
              <div className="saved-meeting" key={n.id}>
                <button
                  onClick={() => {
                    if (
                      (transcript || summary) &&
                      !confirm("편집 중인 내용 대신 저장된 회의를 열까요?")
                    )
                      return;
                    setSelected(n.id);
                    setTitle(n.title);
                    setTranscript(n.transcript);
                    setSummary(n.summary);
                    setItems(n.action_items);
                  }}
                >
                  <strong>{n.title}</strong>
                  <small>
                    {new Date(n.created_at).toLocaleDateString("ko-KR", {
                      timeZone: "Asia/Seoul",
                    })}
                  </small>
                </button>
                <button
                  aria-label="회의 삭제"
                  onClick={async () => {
                    if (
                      confirm(
                        "녹취록과 회의록을 삭제할까요? 원본 음성은 별도로 삭제해야 합니다.",
                      )
                    )
                      if (await mutate("meeting_notes", { id: n.id }, true)) {
                        if (selected === n.id) {
                          setSelected(null);
                          setTranscript("");
                          setSummary("");
                          setItems([]);
                        }
                      }
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          {!data.meeting_notes.length && (
            <p className="muted">저장한 기록이 이곳에 모입니다.</p>
          )}
          <button
            className="text-button"
            onClick={() => {
              setSelected(null);
              setTitle("새 회의 기록");
              setTranscript("");
              setSummary("");
              setItems([]);
            }}
          >
            + 새 기록
          </button>
        </section>
        {cloudConfigured && (
          <section className="panel settings-card audio-library">
            <h2>원본 음성</h2>
            {audios.map((a) => (
              <div className="saved-meeting" key={a.id}>
                <button onClick={() => openAudio(a)}>{a.title}</button>
                <button
                  aria-label="원본 음성 삭제"
                  onClick={() => deleteAudio(a)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            {!audios.length && (
              <p className="muted">비공개로 저장한 음성이 없습니다.</p>
            )}
          </section>
        )}
      </aside>
    </div>
  );
}
