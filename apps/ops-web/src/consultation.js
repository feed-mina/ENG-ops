import {
  buildConsultationPrompt,
  buildConsultationTitle,
  CONSULTATION_MODES,
  MAX_CONSULTATION_TRANSCRIPT_CHARACTERS,
  parseTranscriptFile
} from "../../../packages/consultation-prompts/index.js";

export const CLOVA_URLS = Object.freeze({
  web: "https://clovanote.naver.com/",
  mobile: "https://clovanote.naver.com/app/launch-or-install/"
});

const MAX_TRANSCRIPT_FILE_BYTES = 2 * 1024 * 1024;
const ACCEPTED_TRANSCRIPT_FILE = /\.(?:srt|txt|vtt)$/i;

function element(domDocument, tagName, text, attributes = {}) {
  const node = domDocument.createElement(tagName);
  if (text !== undefined) node.textContent = text;
  for (const [name, value] of Object.entries(attributes)) {
    if (value !== undefined) node.setAttribute(name, String(value));
  }
  return node;
}

function appendLabeledCheckbox(domDocument, parent, { id, text, disabled = false }) {
  const label = element(domDocument, "label", undefined, { class: "consultation-check" });
  const input = element(domDocument, "input", undefined, { id, type: "checkbox" });
  input.disabled = disabled;
  label.append(input, element(domDocument, "span", text));
  parent.append(label);
  return input;
}

function appendModeOption(domDocument, parent, { value, label, description, checked }) {
  const option = element(domDocument, "label", undefined, { class: "consultation-mode" });
  const radio = element(domDocument, "input", undefined, {
    type: "radio",
    name: "consultation-mode",
    value
  });
  radio.value = value;
  radio.checked = checked;
  const copy = element(domDocument, "span");
  copy.append(
    element(domDocument, "strong", label),
    element(domDocument, "small", description)
  );
  option.append(radio, copy);
  parent.append(option);
  return radio;
}

export function formatElapsed(totalSeconds) {
  const safeSeconds = Number.isFinite(totalSeconds) && totalSeconds > 0
    ? Math.floor(totalSeconds)
    : 0;
  return `${String(Math.floor(safeSeconds / 60)).padStart(2, "0")}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

export function pickRecorderMimeType(MediaRecorderCtor) {
  if (typeof MediaRecorderCtor?.isTypeSupported !== "function") return "";
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
    .find((mimeType) => MediaRecorderCtor.isTypeSupported(mimeType)) ?? "";
}

function isMobileBrowser(browserNavigator) {
  const isIpad = browserNavigator?.platform === "MacIntel" && browserNavigator?.maxTouchPoints > 1;
  return browserNavigator?.userAgentData?.mobile === true
    || /Android|iPhone|iPad|iPod/i.test(browserNavigator?.userAgent ?? "")
    || isIpad;
}

function releaseStream(stream) {
  for (const track of stream?.getTracks?.() ?? []) track.stop?.();
}

export function mountConsultationAssistant(container, {
  browserNavigator = globalThis.navigator,
  MediaRecorderCtor = globalThis.MediaRecorder,
  URLApi = globalThis.URL,
  setIntervalFn = globalThis.setInterval,
  clearIntervalFn = globalThis.clearInterval,
  now = () => new Date()
} = {}) {
  const domDocument = container.ownerDocument;
  const main = element(domDocument, "main", undefined, {
    class: "consultation-page",
    tabindex: "-1",
    "data-page-title": "통화 업무 도우미"
  });

  const hero = element(domDocument, "header", undefined, { class: "consultation-hero" });
  hero.append(
    element(domDocument, "p", "엄마 업무용 · 내부 전용", { class: "consultation-eyebrow" }),
    element(domDocument, "h1", "통화 업무 도우미"),
    element(domDocument, "p", "회의록 대신 구직자와 식당 사장님의 통화에서 필요한 사실, 다시 물어볼 내용, 다음 할 일을 정리합니다.")
  );
  main.append(hero);

  const privacy = element(domDocument, "section", undefined, {
    class: "consultation-callout consultation-callout-safe",
    "aria-labelledby": "consultation-privacy-title"
  });
  privacy.append(
    element(domDocument, "h2", "브라우저 안에서만 작업합니다", { id: "consultation-privacy-title" }),
    element(domDocument, "p", "이 화면은 녹음·전사문·프롬프트를 서버, D1, R2에 전송하거나 저장하지 않습니다. 새로고침하거나 화면을 닫으면 사라집니다."),
    element(domDocument, "p", "주민등록번호, 계좌·카드번호, 비밀번호·인증번호, 건강·가족 정보는 입력하지 마세요."),
    element(domDocument, "p", "자동 마스킹은 일부 번호·이메일·인증정보 패턴만 찾습니다. 이름, 상세 주소, 생년월일, 건강·가족 정보는 자동으로 지워지지 않으므로 직접 삭제해야 합니다.")
  );
  main.append(privacy);

  const consentSection = element(domDocument, "section", undefined, {
    class: "consultation-card",
    "aria-labelledby": "consultation-consent-title"
  });
  consentSection.append(
    element(domDocument, "p", "1단계", { class: "consultation-step" }),
    element(domDocument, "h2", "녹음·전사 동의 확인", { id: "consultation-consent-title" }),
    element(domDocument, "p", "상담 내용 정리와 후속 업무 지원을 위해 녹음·전사·업무 프롬프트를 만든다는 사실을 통화 참여자 모두에게 알리고 동의를 받아야 합니다. 동의하지 않으면 녹음하지 말고 수기 메모만 작성하세요.")
  );
  const consent = appendLabeledCheckbox(domDocument, consentSection, {
    id: "consultation-consent",
    text: "통화 참여자 모두에게 목적을 알렸고 녹음·전사·프롬프트 작성 동의를 받았습니다."
  });
  main.append(consentSection);

  const captureSection = element(domDocument, "section", undefined, {
    class: "consultation-card",
    "aria-labelledby": "consultation-capture-title"
  });
  captureSection.append(
    element(domDocument, "p", "2단계", { class: "consultation-step" }),
    element(domDocument, "h2", "오늘 통화 가져오기", { id: "consultation-capture-title" }),
    element(domDocument, "p", "이 화면에서 마이크를 녹음하거나, 클로바노트에서 만든 자막 파일을 불러올 수 있습니다.")
  );

  const controls = element(domDocument, "div", undefined, { class: "consultation-controls" });
  const startButton = element(domDocument, "button", "녹음 시작", { type: "button", class: "button button-primary" });
  const stopButton = element(domDocument, "button", "녹음 종료", { type: "button", class: "button button-muted" });
  const timer = element(domDocument, "output", "00:00", {
    class: "consultation-timer",
    "aria-label": "녹음 시간"
  });
  startButton.disabled = true;
  stopButton.disabled = true;
  controls.append(startButton, stopButton, timer);
  captureSection.append(controls);

  const audioPreview = element(domDocument, "audio", undefined, {
    class: "consultation-audio",
    controls: "",
    preload: "metadata"
  });
  audioPreview.hidden = true;
  const downloadLink = element(domDocument, "a", "녹음 파일 저장", {
    class: "button button-secondary",
    download: "오늘-상담-녹음.webm"
  });
  downloadLink.hidden = true;
  captureSection.append(audioPreview, downloadLink);

  const externalActions = element(domDocument, "div", undefined, { class: "consultation-external-actions" });
  const clovaUrl = isMobileBrowser(browserNavigator) ? CLOVA_URLS.mobile : CLOVA_URLS.web;
  const clovaLink = element(domDocument, "a", "클로바노트에서 녹음·전사하기", {
    class: "button button-outline",
    rel: "noopener noreferrer",
    "aria-disabled": "true"
  });
  if (!isMobileBrowser(browserNavigator)) clovaLink.setAttribute("target", "_blank");
  const fileInput = element(domDocument, "input", undefined, {
    id: "consultation-transcript-file",
    type: "file",
    accept: ".vtt,.srt,.txt,text/plain,text/vtt,application/x-subrip",
    class: "visually-hidden"
  });
  fileInput.disabled = true;
  const fileButton = element(domDocument, "button", "자막 파일 불러오기", {
    type: "button",
    class: "button button-outline"
  });
  fileButton.disabled = true;
  externalActions.append(clovaLink, fileInput, fileButton);
  captureSection.append(
    externalActions,
    element(domDocument, "p", "일반 전화 앱의 통화기록을 자동으로 가져오지는 않습니다. PC 마이크나 스피커폰처럼 마이크에 들리는 소리만 녹음됩니다.", { class: "consultation-help" }),
    element(domDocument, "p", "클로바에는 녹음과 녹취가 별도로 저장될 수 있습니다. 동의를 받은 뒤 사용하고, 작업 완료 후 클로바에 남은 원본도 직접 삭제하세요.", { class: "consultation-help" })
  );
  main.append(captureSection);

  const transcriptSection = element(domDocument, "section", undefined, {
    class: "consultation-card",
    "aria-labelledby": "consultation-transcript-title"
  });
  transcriptSection.append(
    element(domDocument, "p", "3단계", { class: "consultation-step" }),
    element(domDocument, "h2", "상담 대상과 통화 내용", { id: "consultation-transcript-title" })
  );
  const modeGroup = element(domDocument, "fieldset", undefined, { class: "consultation-mode-group" });
  modeGroup.append(element(domDocument, "legend", "누구와 통화했나요?"));
  const jobMode = appendModeOption(domDocument, modeGroup, {
    value: CONSULTATION_MODES.JOB_SEEKER,
    label: "구직자 상담",
    description: "희망 업무·근무 조건·준비 서류·다음 연락을 정리",
    checked: true
  });
  const restaurantMode = appendModeOption(domDocument, modeGroup, {
    value: CONSULTATION_MODES.RESTAURANT_OWNER,
    label: "식당 사장님 구인 상담",
    description: "필요 인원·업무·근무 조건·확인 질문을 정리",
    checked: false
  });
  transcriptSection.append(modeGroup);

  const metadataGroup = element(domDocument, "div", undefined, { class: "consultation-metadata" });
  const recordDateLabel = element(domDocument, "label", "상담 날짜", {
    for: "consultation-record-date",
    class: "consultation-label"
  });
  const recordDate = element(domDocument, "input", undefined, {
    id: "consultation-record-date",
    type: "date",
    required: ""
  });
  recordDate.value = now().toISOString().slice(0, 10);
  const titleLabel = element(domDocument, "label", "제목 (선택)", {
    for: "consultation-title",
    class: "consultation-label"
  });
  const title = element(domDocument, "input", undefined, {
    id: "consultation-title",
    type: "text",
    maxlength: "100",
    placeholder: "비워 두면 날짜와 상담 유형으로 자동 생성됩니다."
  });
  metadataGroup.append(recordDateLabel, recordDate, titleLabel, title);
  transcriptSection.append(metadataGroup);

  const transcriptLabel = element(domDocument, "label", "전사문 또는 수기 메모", {
    for: "consultation-transcript",
    class: "consultation-label"
  });
  const transcript = element(domDocument, "textarea", undefined, {
    id: "consultation-transcript",
    rows: "14",
    maxlength: String(MAX_CONSULTATION_TRANSCRIPT_CHARACTERS),
    placeholder: "클로바 전사문을 붙여넣거나, 통화 내용을 수기로 적으세요. 민감정보는 먼저 지워 주세요."
  });
  const characterCount = element(domDocument, "output", `0 / ${MAX_CONSULTATION_TRANSCRIPT_CHARACTERS.toLocaleString("ko-KR")}자`, {
    class: "consultation-count",
    "aria-live": "polite"
  });
  const generateButton = element(domDocument, "button", "맞춤 업무 프롬프트 만들기", {
    type: "button",
    class: "button button-primary button-wide"
  });
  transcriptSection.append(transcriptLabel, transcript, characterCount, generateButton);
  main.append(transcriptSection);

  const resultSection = element(domDocument, "section", undefined, {
    class: "consultation-card",
    "aria-labelledby": "consultation-result-title"
  });
  resultSection.append(
    element(domDocument, "p", "4단계", { class: "consultation-step" }),
    element(domDocument, "h2", "업무 프롬프트 확인·복사", { id: "consultation-result-title" }),
    element(domDocument, "p", "AI가 작성할 결과는 초안입니다. 누락·오해가 있을 수 있으므로 통화 내용과 근무조건을 확인하세요. 채용·거절·급여·계약 결정에 단독으로 사용하면 안 됩니다.", { class: "consultation-callout consultation-callout-warning" })
  );
  const promptLabel = element(domDocument, "label", "생성된 업무 프롬프트", {
    for: "consultation-prompt",
    class: "consultation-label"
  });
  const promptOutput = element(domDocument, "textarea", undefined, {
    id: "consultation-prompt",
    rows: "18",
    readonly: "",
    placeholder: "통화 내용을 입력하고 프롬프트 만들기를 누르면 여기에 표시됩니다."
  });
  resultSection.append(promptLabel, promptOutput);
  const reviewed = appendLabeledCheckbox(domDocument, resultSection, {
    id: "consultation-reviewed",
    text: "자동 마스킹은 일부 번호·이메일·인증정보만 지원합니다. 원문과 비교해 이름·주소·생년월일·건강·가족 정보 등 남은 민감정보를 직접 삭제했습니다.",
    disabled: true
  });
  const copyButton = element(domDocument, "button", "검토한 업무 기록 복사", {
    type: "button",
    class: "button button-secondary"
  });
  copyButton.disabled = true;
  const downloadPromptLink = element(domDocument, "a", "검토한 업무 기록 다운로드", {
    class: "button button-secondary",
    "aria-disabled": "true"
  });
  resultSection.append(copyButton, downloadPromptLink);
  main.append(resultSection);

  const status = element(domDocument, "p", "먼저 통화 참여자의 동의를 확인해 주세요.", {
    class: "consultation-status",
    role: "status",
    "aria-live": "polite"
  });
  main.append(status);
  container.replaceChildren(main);
  main.focus?.({ preventScroll: true });

  let recordingSession = null;
  let recordingStartPending = false;
  let recordingGeneration = 0;
  let timerId = null;
  let recordingUrl = "";
  let disposed = false;
  let consentPreviouslyGranted = false;

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.setAttribute("data-tone", isError ? "error" : "info");
  }

  function clearCompletedRecording() {
    audioPreview.pause?.();
    audioPreview.removeAttribute?.("src");
    audioPreview.hidden = true;
    downloadLink.removeAttribute?.("href");
    downloadLink.hidden = true;
    revokeRecordingUrl();
  }

  function clearConsentData() {
    clearCompletedRecording();
    fileInput.value = "";
    transcript.value = "";
    characterCount.textContent = `0 / ${MAX_CONSULTATION_TRANSCRIPT_CHARACTERS.toLocaleString("ko-KR")}자`;
    invalidatePrompt();
  }

  function updateConsentState() {
    const granted = consent.checked === true;
    const stoppedForWithdrawal = !granted
      && recordingSession !== null
      && recordingSession.recorder?.state !== "inactive";
    if (!granted) recordingGeneration += 1;
    if (stoppedForWithdrawal) {
      setStatus("동의가 해제되어 진행 중인 녹음을 삭제하고 있습니다.", true);
      stopRecording("consent-withdrawn");
    }
    if (!granted && consentPreviouslyGranted) clearConsentData();
    consentPreviouslyGranted = granted;
    startButton.disabled = !granted
      || typeof MediaRecorderCtor !== "function"
      || recordingStartPending
      || recordingSession !== null;
    fileInput.disabled = !granted;
    fileButton.disabled = !granted;
    clovaLink.setAttribute("aria-disabled", granted ? "false" : "true");
    if (granted) clovaLink.setAttribute("href", clovaUrl);
    else clovaLink.removeAttribute?.("href");
    if (!granted) {
      if (!stoppedForWithdrawal) setStatus("동의가 없으면 녹음·전사·프롬프트 생성을 사용할 수 없습니다. 수기 메모만 작성할 수 있습니다.");
      return;
    }
    if (typeof MediaRecorderCtor !== "function") setStatus("이 브라우저는 마이크 녹음을 지원하지 않습니다. 클로바노트나 자막 파일을 이용하세요.", true);
    else setStatus("동의 확인 완료. 녹음하거나 자막을 불러올 수 있습니다.");
  }

  function clearTimer() {
    if (timerId !== null) clearIntervalFn?.(timerId);
    timerId = null;
  }

  function revokeRecordingUrl() {
    if (recordingUrl) URLApi?.revokeObjectURL?.(recordingUrl);
    recordingUrl = "";
  }

  async function startRecording() {
    if (disposed || recordingStartPending || recordingSession) return;
    if (!consent.checked) {
      setStatus("통화 참여자 모두의 동의를 먼저 확인하세요.", true);
      return;
    }
    if (typeof MediaRecorderCtor !== "function" || typeof browserNavigator?.mediaDevices?.getUserMedia !== "function") {
      setStatus("이 브라우저에서는 마이크 녹음을 시작할 수 없습니다.", true);
      return;
    }
    const generation = ++recordingGeneration;
    recordingStartPending = true;
    startButton.disabled = true;
    stopButton.disabled = true;
    setStatus("마이크 권한을 확인하고 있습니다.");
    let requestedStream = null;
    let pendingSession = null;
    try {
      requestedStream = await browserNavigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false
      });
      if (disposed || !consent.checked || generation !== recordingGeneration) {
        releaseStream(requestedStream);
        requestedStream = null;
        if (!disposed) setStatus("동의가 해제되어 녹음을 시작하지 않았습니다.", true);
        return;
      }
      const mimeType = pickRecorderMimeType(MediaRecorderCtor);
      let recorder;
      try {
        recorder = mimeType
          ? new MediaRecorderCtor(requestedStream, { mimeType })
          : new MediaRecorderCtor(requestedStream);
      } catch {
        recorder = new MediaRecorderCtor(requestedStream);
      }
      const session = {
        generation,
        recorder,
        stream: requestedStream,
        chunks: [],
        mimeType: recorder.mimeType || mimeType || "audio/webm",
        startedAt: Date.now(),
        stopReason: "completed",
        finalized: false
      };
      pendingSession = session;
      clearCompletedRecording();
      recorder.addEventListener("dataavailable", (event) => {
        if (!session.finalized && event.data?.size > 0) session.chunks.push(event.data);
      });
      recorder.addEventListener("error", () => {
        if (recordingSession !== session) return;
        setStatus("녹음 중 오류가 발생했습니다. 마이크 권한을 확인하세요.", true);
        stopRecording("error");
      });
      recorder.addEventListener("stop", () => finalizeRecordingSession(session));
      recorder.start(1000);
      recordingSession = session;
      requestedStream = null;
      pendingSession = null;
      timer.textContent = "00:00";
      clearTimer();
      timerId = setIntervalFn?.(() => {
        if (recordingSession === session) {
          timer.textContent = formatElapsed((Date.now() - session.startedAt) / 1000);
        }
      }, 1000) ?? null;
      stopButton.disabled = false;
      setStatus("녹음 중입니다. 통화가 끝나면 녹음 종료를 누르세요.");
    } catch {
      releaseStream(pendingSession?.stream ?? requestedStream);
      if (pendingSession) pendingSession.stream = null;
      if (recordingSession?.generation === generation) recordingSession = null;
      stopButton.disabled = true;
      if (!disposed && generation === recordingGeneration) {
        setStatus("마이크 권한을 허용하지 못했습니다. 브라우저 주소창의 마이크 권한을 확인하세요.", true);
      }
    } finally {
      recordingStartPending = false;
      if (!disposed && recordingSession === null) {
        startButton.disabled = !consent.checked || typeof MediaRecorderCtor !== "function";
      }
    }
  }

  function finalizeRecordingSession(session) {
    if (session.finalized) return;
    session.finalized = true;
    if (recordingSession === session) recordingSession = null;
    clearTimer();
    releaseStream(session.stream);
    session.stream = null;
    stopButton.disabled = true;
    startButton.disabled = disposed
      || !consent.checked
      || typeof MediaRecorderCtor !== "function"
      || recordingStartPending;

    const discard = disposed || !consent.checked || session.stopReason !== "completed";
    if (discard) {
      session.chunks = [];
      clearCompletedRecording();
      if (!disposed) {
        const message = session.stopReason === "consent-withdrawn"
          ? "동의가 해제되어 진행 중이던 녹음을 삭제했습니다."
          : "오류가 발생해 진행 중이던 녹음을 삭제했습니다.";
        setStatus(message, true);
      }
      return;
    }

    const blob = new Blob(session.chunks, { type: session.mimeType });
    session.chunks = [];
    if (blob.size > 0 && typeof URLApi?.createObjectURL === "function") {
      recordingUrl = URLApi.createObjectURL(blob);
      audioPreview.src = recordingUrl;
      audioPreview.hidden = false;
      downloadLink.setAttribute("href", recordingUrl);
      downloadLink.setAttribute("download", `상담-녹음-${new Date().toISOString().slice(0, 10)}.${session.mimeType.includes("mp4") ? "m4a" : "webm"}`);
      downloadLink.hidden = false;
      setStatus("녹음이 끝났습니다. 이 화면에서는 로컬로만 재생됩니다. 전사는 클로바노트에서 진행한 뒤 자막을 불러오세요.");
    } else {
      setStatus("녹음 데이터가 비어 있습니다. 다시 녹음해 주세요.", true);
    }
  }

  function stopRecording(reason = "completed") {
    const session = recordingSession;
    if (!session || session.finalized) return;
    session.stopReason = reason;
    startButton.disabled = true;
    stopButton.disabled = true;
    if (reason !== "completed") {
      releaseStream(session.stream);
      session.stream = null;
    }
    try {
      if (session.recorder.state !== "inactive") session.recorder.stop();
      else finalizeRecordingSession(session);
    } catch {
      finalizeRecordingSession(session);
    }
  }

  function invalidatePrompt() {
    promptOutput.value = "";
    reviewed.checked = false;
    reviewed.disabled = true;
    copyButton.disabled = true;
    downloadPromptLink.removeAttribute?.("href");
    downloadPromptLink.removeAttribute?.("download");
    downloadPromptLink.setAttribute("aria-disabled", "true");
  }

  async function importTranscriptFile() {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      if (!consent.checked) throw new Error("CONSENT_REQUIRED");
      if (file.size > MAX_TRANSCRIPT_FILE_BYTES) throw new Error("FILE_TOO_LARGE");
      if (!ACCEPTED_TRANSCRIPT_FILE.test(file.name) && !String(file.type).startsWith("text/")) throw new Error("UNSUPPORTED_FILE");
      const parsed = parseTranscriptFile(await file.text(), file.name);
      if (disposed) return;
      const mergedTranscript = [transcript.value.trim(), parsed].filter(Boolean).join("\n");
      if (mergedTranscript.length > MAX_CONSULTATION_TRANSCRIPT_CHARACTERS) throw new Error("TRANSCRIPT_TOO_LONG");
      transcript.value = mergedTranscript;
      characterCount.textContent = `${transcript.value.length.toLocaleString("ko-KR")} / 60,000자`;
      invalidatePrompt();
      setStatus(`'${file.name}' 자막을 불러왔습니다. 원문과 민감정보를 확인하세요.`);
    } catch (error) {
      const message = error?.message === "CONSENT_REQUIRED"
        ? "동의를 확인한 뒤 자막을 불러오세요."
        : error?.message === "FILE_TOO_LARGE"
          ? "자막 파일은 2MB 이하만 불러올 수 있습니다."
          : error?.message === "TRANSCRIPT_TOO_LONG"
            ? `자막을 합친 내용은 ${MAX_CONSULTATION_TRANSCRIPT_CHARACTERS.toLocaleString("ko-KR")}자 이하여야 합니다.`
            : "VTT, SRT, TXT 자막 파일만 불러올 수 있습니다.";
      setStatus(message, true);
    } finally {
      fileInput.value = "";
    }
  }

  function selectedMode() {
    return restaurantMode.checked
      ? CONSULTATION_MODES.RESTAURANT_OWNER
      : CONSULTATION_MODES.JOB_SEEKER;
  }

  function generatePrompt() {
    try {
      if (disposed) return;
      if (!consent.checked) throw new Error("동의 확인이 필요합니다.");
      const mode = selectedMode();
      const recordTitle = buildConsultationTitle({ mode, recordDate: recordDate.value, title: title.value });
      const prompt = buildConsultationPrompt({
        mode,
        transcript: transcript.value,
        recordDate: recordDate.value,
        title: title.value
      });
      promptOutput.value = prompt;
      title.value = recordTitle;
      reviewed.disabled = false;
      reviewed.checked = false;
      copyButton.disabled = true;
      setStatus("업무 프롬프트를 만들었습니다. 원문과 민감정보 삭제 결과를 확인한 뒤 복사하세요.");
      promptOutput.focus?.({ preventScroll: true });
    } catch (error) {
      setStatus(error?.message || "통화 내용을 확인해 주세요.", true);
      transcript.focus?.({ preventScroll: true });
    }
  }

  async function copyPrompt() {
    if (disposed) return;
    if (!consent.checked) {
      setStatus("동의가 해제되어 프롬프트를 복사할 수 없습니다.", true);
      return;
    }
    if (!reviewed.checked || !promptOutput.value) {
      setStatus("원문과 민감정보를 확인한 뒤 체크해 주세요.", true);
      return;
    }
    try {
      if (typeof browserNavigator?.clipboard?.writeText !== "function") throw new Error("CLIPBOARD_UNAVAILABLE");
      await browserNavigator.clipboard.writeText(promptOutput.value);
      setStatus("검토한 업무 프롬프트를 복사했습니다. 승인된 업무용 AI에만 붙여넣으세요.");
    } catch {
      setStatus("자동 복사를 사용할 수 없습니다. 프롬프트 상자를 직접 선택해 복사하세요.", true);
      promptOutput.focus?.({ preventScroll: true });
      promptOutput.select?.();
    }
  }

  consent.addEventListener("change", updateConsentState);
  startButton.addEventListener("click", () => { void startRecording(); });
  stopButton.addEventListener("click", () => { stopRecording(); });
  clovaLink.addEventListener("click", (event) => {
    if (!consent.checked) {
      event.preventDefault();
      setStatus("통화 참여자 모두의 동의를 확인한 뒤 클로바노트를 여세요.", true);
      return;
    }
    setStatus("클로바노트에 저장된 원본과 녹취는 작업 후 직접 삭제하세요.");
  });
  fileButton.addEventListener("click", () => {
    if (consent.checked) fileInput.click?.();
  });
  fileInput.addEventListener("change", () => { void importTranscriptFile(); });
  transcript.addEventListener("input", () => {
    characterCount.textContent = `${transcript.value.length.toLocaleString("ko-KR")} / ${MAX_CONSULTATION_TRANSCRIPT_CHARACTERS.toLocaleString("ko-KR")}자`;
    invalidatePrompt();
  });
  jobMode.addEventListener("change", invalidatePrompt);
  restaurantMode.addEventListener("change", invalidatePrompt);
  recordDate.addEventListener("change", invalidatePrompt);
  title.addEventListener("input", invalidatePrompt);
  generateButton.addEventListener("click", generatePrompt);
  reviewed.addEventListener("change", () => {
    const enabled = reviewed.checked && consent.checked && Boolean(promptOutput.value);
    copyButton.disabled = !enabled;
    if (enabled) {
      downloadPromptLink.setAttribute("href", `data:text/plain;charset=utf-8,${encodeURIComponent(promptOutput.value)}`);
      downloadPromptLink.setAttribute("download", `${recordDate.value}-${selectedMode()}-업무기록.txt`);
      downloadPromptLink.setAttribute("aria-disabled", "false");
    } else {
      downloadPromptLink.removeAttribute?.("href");
      downloadPromptLink.removeAttribute?.("download");
      downloadPromptLink.setAttribute("aria-disabled", "true");
    }
  });
  copyButton.addEventListener("click", () => { void copyPrompt(); });

  updateConsentState();

  return Object.freeze({
    element: main,
    cleanup() {
      disposed = true;
      recordingGeneration += 1;
      clearTimer();
      stopRecording("disposed");
      clearConsentData();
    }
  });
}
