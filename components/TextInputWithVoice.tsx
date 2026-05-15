"use client";

import {
  ActionIcon,
  TextInput,
  Tooltip,
  type TextInputProps,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { Mic, Square } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { warmUpMicrophoneForSpeech } from "@/lib/voice-booking/mic-warmup";

/** Speech engines often append a sentence-ending period; strip it from search. */
export function trimVoiceSearchTranscript(text: string): string {
  return text.replace(/\.+$/u, "").trimEnd();
}

type SpeechRecognitionResultLike = {
  transcript?: string;
};

type SpeechRecognitionAlternativeLike = [
  SpeechRecognitionResultLike,
  ...SpeechRecognitionResultLike[],
];

type SpeechRecognitionResultEntryLike = {
  isFinal: boolean;
  0?: SpeechRecognitionResultLike;
} & SpeechRecognitionAlternativeLike;

type SpeechRecognitionResultListLike = ArrayLike<SpeechRecognitionResultEntryLike>;

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructorLike = new () => SpeechRecognitionLike;

type SpeechApi = typeof window & {
  SpeechRecognition?: SpeechRecognitionConstructorLike;
  webkitSpeechRecognition?: SpeechRecognitionConstructorLike;
};

function getSpeechRecognition(ww: SpeechApi) {
  return ww.SpeechRecognition ?? ww.webkitSpeechRecognition ?? null;
}

export type TextInputWithVoiceProps = Omit<TextInputProps, "rightSection"> & {
  voiceIconSize?: "sm" | "md";
};

export const TextInputWithVoice = forwardRef<HTMLInputElement, TextInputWithVoiceProps>(
  function TextInputWithVoice(
    {
      voiceIconSize = "sm",
      size,
      disabled,
      onChange,
      ...rest
    },
    ref
  ) {
    const [isListening, setIsListening] = useState(false);
    const [isWarming, setIsWarming] = useState(false);
    const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    const emitValue = useCallback((next: string) => {
      const handler = onChangeRef.current;
      if (!handler) {
        return;
      }
      handler({
        currentTarget: { value: next },
        target: { value: next },
      } as ChangeEvent<HTMLInputElement>);
    }, []);

    const stopVoiceSearch = useCallback(() => {
      if (!isListening) {
        return;
      }
      recognitionRef.current?.stop();
    }, [isListening]);

    const startVoiceSearch = useCallback(async () => {
      if (typeof window === "undefined") {
        return;
      }
      const SR = getSpeechRecognition(window as SpeechApi);
      if (!SR) {
        notifications.show({
          color: "red",
          message: "Trình duyệt không hỗ trợ nhận diện giọng nói. Thử Chrome hoặc Edge.",
        });
        return;
      }
      if (isWarming || isListening || disabled) {
        return;
      }

      setIsWarming(true);
      try {
        await warmUpMicrophoneForSpeech();
      } catch (e) {
        setIsWarming(false);
        const name = e instanceof Error ? e.name : "";
        notifications.show({
          color: "red",
          message:
            name === "NotAllowedError"
              ? "Cho phép micro trong trình duyệt rồi thử tìm bằng giọng nói lại."
              : "Không bật được micro. Kiểm tra thiết bị rồi thử lại.",
        });
        return;
      }
      setIsWarming(false);

      const rec = new SR();
      recognitionRef.current = rec;
      rec.lang = "vi-VN";
      rec.continuous = false;
      rec.interimResults = true;
      let finalText = "";
      rec.onresult = (event) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const txt = event.results[i]?.[0]?.transcript ?? "";
          if (event.results[i]?.isFinal) {
            finalText += txt;
          } else {
            interim += txt;
          }
        }
        emitValue(trimVoiceSearchTranscript((finalText + " " + interim).trim()));
      };
      rec.onerror = () => setIsListening(false);
      rec.onend = () => setIsListening(false);
      setIsListening(true);
      try {
        rec.start();
      } catch {
        setIsListening(false);
        recognitionRef.current = null;
        notifications.show({
          color: "red",
          message: "Không khởi động được nhận diện giọng nói.",
        });
      }
    }, [disabled, emitValue, isListening, isWarming]);

    useEffect(() => {
      return () => {
        try {
          recognitionRef.current?.stop();
        } catch {
          /* noop */
        }
        recognitionRef.current = null;
      };
    }, []);

    const actionIconSize = voiceIconSize === "md" ? "md" : "sm";
    const rightSectionWidth = voiceIconSize === "md" ? 44 : 40;

    const voiceSection = (
      <Tooltip label={isListening ? "Dừng ghi âm" : "Tìm bằng giọng nói"} withArrow>
        <ActionIcon
          variant={isListening ? "filled" : "subtle"}
          color={isListening ? "red" : "gray"}
          loading={isWarming}
          size={actionIconSize}
          radius="sm"
          onClick={() => {
            if (isListening) {
              stopVoiceSearch();
            } else {
              void startVoiceSearch();
            }
          }}
          aria-label={isListening ? "Dừng ghi âm" : "Tìm bằng giọng nói"}
        >
          {isListening ? (
            <Square size={voiceIconSize === "md" ? 15 : 13} strokeWidth={2.5} fill="currentColor" />
          ) : (
            <Mic size={voiceIconSize === "md" ? 19 : 17} strokeWidth={2} />
          )}
        </ActionIcon>
      </Tooltip>
    );

    return (
      <TextInput
        ref={ref}
        size={size}
        disabled={disabled}
        onChange={onChange}
        rightSection={voiceSection}
        rightSectionWidth={rightSectionWidth}
        rightSectionPointerEvents="all"
        {...rest}
      />
    );
  }
);
