"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

import type { DetectedFaceBox, PersonPhoto } from "@/lib/types";

interface PersonPhotoGalleryProps {
  photos: PersonPhoto[];
}

interface Size {
  width: number;
  height: number;
}

function formatConfidence(confidence: number | null): string | null {
  if (confidence === null || Number.isNaN(confidence)) {
    return null;
  }

  return `${Math.round(confidence * 1000) / 10}%`;
}

function getContainedImageRect(container: Size, natural: Size) {
  const containerRatio = container.width / container.height;
  const naturalRatio = natural.width / natural.height;

  if (naturalRatio > containerRatio) {
    const width = container.width;
    const height = width / naturalRatio;

    return {
      left: 0,
      top: (container.height - height) / 2,
      width,
      height
    };
  }

  const height = container.height;
  const width = height * naturalRatio;

  return {
    left: (container.width - width) / 2,
    top: 0,
    width,
    height
  };
}

function getFaceStyle(face: DetectedFaceBox, container: Size, natural: Size): CSSProperties {
  const imageRect = getContainedImageRect(container, natural);
  const width = face.bbox.x2 - face.bbox.x1;
  const height = face.bbox.y2 - face.bbox.y1;

  return {
    left: imageRect.left + imageRect.width * (face.bbox.x1 / natural.width),
    top: imageRect.top + imageRect.height * (face.bbox.y1 / natural.height),
    width: imageRect.width * (width / natural.width),
    height: imageRect.height * (height / natural.height)
  };
}

function PersonPhotoCard({ photo, index }: { photo: PersonPhoto; index: number }) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = useState<Size | null>(null);
  const [naturalSize, setNaturalSize] = useState<Size | null>(null);

  useEffect(() => {
    const node = stageRef.current;
    if (!node) {
      return;
    }

    const updateSize = () => {
      setStageSize({
        width: node.clientWidth,
        height: node.clientHeight
      });
    };

    updateSize();

    const observer = new ResizeObserver(() => {
      updateSize();
    });
    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <article className="photo-card">
      <div className="photo-stage" ref={stageRef}>
        {photo.signedUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={`Фото ${index + 1}`}
              className="photo-thumb photo-thumb-contained"
              onLoad={(event) => {
                setNaturalSize({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight
                });
              }}
              src={photo.signedUrl}
            />
            {stageSize && naturalSize ? (
              <div aria-hidden="true" className="face-overlay-layer">
                {photo.faces.map((face) => {
                  const confidence = formatConfidence(face.confidence);

                  return (
                    <div className="face-box" key={face.id} style={getFaceStyle(face, stageSize, naturalSize)}>
                      {confidence ? (
                        <span className="face-box-label">Лицо {confidence}</span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </>
        ) : (
          <div className="photo-stage-empty">Оригинал фотографии сейчас недоступен.</div>
        )}
      </div>

      <div className="photo-card-copy">
        <div className="photo-card-meta">
          <strong>Фото {index + 1}</strong>
          <span className="photo-card-badge">
            {photo.faces.length > 0 ? `${photo.faces.length} детекц.` : "Без bbox"}
          </span>
        </div>
        <p className="photo-card-path muted">{photo.storagePath}</p>
      </div>
    </article>
  );
}

export function PersonPhotoGallery({ photos }: PersonPhotoGalleryProps) {
  return (
    <section className="photo-grid">
      {photos.map((photo, index) => (
        <PersonPhotoCard index={index} key={photo.id} photo={photo} />
      ))}
    </section>
  );
}
