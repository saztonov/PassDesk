import { useState, useRef, useEffect, useCallback } from "react";
import { Modal, Button, Spin, message, Alert } from "antd";
import {
  CameraOutlined,
  RotateRightOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import Webcam from "react-webcam";

/**
 * Модальное окно для сканирования документов
 * Использует OpenCV.js напрямую для автоматического поиска границ
 */
export const DocumentScannerModal = ({
  visible,
  onCapture,
  onCancel,
  mode = "document",
}) => {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const lastContourRef = useRef(null);
  const stableCounterRef = useRef(0);

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [cvReady, setCvReady] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const [processedImage, setProcessedImage] = useState(null);
  const [error, setError] = useState(null);
  const [isStable, setIsStable] = useState(false);
  const [viewport, setViewport] = useState(() => {
    if (typeof window === "undefined") {
      return { isMobile: false, isPortrait: false };
    }
    return {
      isMobile: window.innerWidth < 768,
      isPortrait: window.innerHeight >= window.innerWidth,
    };
  });
  const isPassportMode = mode === "passport";
  const isMobileViewport = viewport.isMobile;
  const isPortraitViewport = viewport.isPortrait;
  const isVerticalPassportGuide =
    isPassportMode && isMobileViewport && isPortraitViewport;

  // Константы для анализа видеопотока
  const ANALYSIS_WIDTH = 480;

  // Константы для рамки приоритета
  const FRAME_PERCENTAGE = 0.6; // Рамка займет 60% экрана
  const OUTER_MARGIN_PERCENTAGE = (1 - FRAME_PERCENTAGE) / 2; // 20% с каждой стороны
  const MAX_OUTSIDE_PERCENTAGE = 0.15; // Максимум 15% документа может быть за пределами рамки

  // Весовые коэффициенты
  const PRIORITY_INNER = 10; // х10 внутри рамки
  const PRIORITY_EDGE = 20; // х20 на краях рамки

  const getGuideRect = useCallback(
    (width, height) => {
      if (isPassportMode) {
        const targetAspect = isVerticalPassportGuide ? 0.72 : 1.9;
        const maxWidth = isVerticalPassportGuide
          ? width * 0.74
          : isMobileViewport
            ? width * 0.82
            : width * 0.88;
        const maxHeight = isVerticalPassportGuide
          ? height * 0.78
          : isMobileViewport
            ? height * 0.42
            : height * 0.62;
        let guideWidth = maxWidth;
        let guideHeight = guideWidth / targetAspect;

        if (guideHeight > maxHeight) {
          guideHeight = maxHeight;
          guideWidth = guideHeight * targetAspect;
        }

        return {
          x: (width - guideWidth) / 2,
          y: (height - guideHeight) / 2,
          width: guideWidth,
          height: guideHeight,
        };
      }

      const frameLeft = width * OUTER_MARGIN_PERCENTAGE;
      const frameTop = height * OUTER_MARGIN_PERCENTAGE;
      const frameWidth = width * FRAME_PERCENTAGE;
      const frameHeight = height * FRAME_PERCENTAGE;

      return {
        x: frameLeft,
        y: frameTop,
        width: frameWidth,
        height: frameHeight,
      };
    },
    [isMobileViewport, isPassportMode, isVerticalPassportGuide],
  );

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const updateViewport = () => {
      setViewport({
        isMobile: window.innerWidth < 768,
        isPortrait: window.innerHeight >= window.innerWidth,
      });
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  const handleModalVisibilityChange = useCallback((open) => {
    if (!open) {
      setCapturedImage(null);
      setProcessedImage(null);
      setError(null);
      setProcessing(false);
      lastContourRef.current = null;
      stableCounterRef.current = 0;
      setIsStable(false);
      return;
    }

    if (window.cv) {
      setCvReady(true);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    const existingScript = document.querySelector(
      "script[data-opencv-script='true']",
    );
    if (existingScript) return;

    const script = document.createElement("script");
    script.dataset.opencvScript = "true";
    script.src = "https://docs.opencv.org/4.8.0/opencv.js";
    script.async = true;
    script.onload = () => {
      if (window.cv.getBuildInformation) {
        setCvReady(true);
        setLoading(false);
      } else {
        window.cv.onRuntimeInitialized = () => {
          setCvReady(true);
          setLoading(false);
        };
      }
    };
    script.onerror = () => {
      setError(
        "Не удалось загрузить библиотеку обработки изображений (OpenCV). Проверьте подключение к интернету.",
      );
      setLoading(false);
    };
    document.body.appendChild(script);
  }, []);

  // Функция для определения весового коэффициента контура на основе его расположения
  const calculateFramePenalty = useCallback(
    (contour, width, height) => {
      const rect = window.cv.boundingRect(contour);

      const guideRect = getGuideRect(width, height);
      const frameLeft = guideRect.x;
      const frameRight = guideRect.x + guideRect.width;
      const frameTop = guideRect.y;
      const frameBottom = guideRect.y + guideRect.height;

      // Считаем пиксели внутри и снаружи рамки
      const rectLeft = Math.max(rect.x, 0);
      const rectRight = Math.min(rect.x + rect.width, width);
      const rectTop = Math.max(rect.y, 0);
      const rectBottom = Math.min(rect.y + rect.height, height);

      // Пересечение с рамкой
      const overlapLeft = Math.max(frameLeft, rectLeft);
      const overlapRight = Math.min(frameRight, rectRight);
      const overlapTop = Math.max(frameTop, rectTop);
      const overlapBottom = Math.min(frameBottom, rectBottom);

      const insideArea =
        Math.max(0, overlapRight - overlapLeft) *
        Math.max(0, overlapBottom - overlapTop);
      const totalArea = rect.width * rect.height;
      const outsidePercentage =
        totalArea > 0 ? (totalArea - insideArea) / totalArea : 0;

      // Если более 15% документа вне рамки - сильный штраф
      if (outsidePercentage > MAX_OUTSIDE_PERCENTAGE) {
        return 0.05; // Практически полный штраф
      }

      // Проверяем, находится ли контур в краях рамки или внутри
      // Считаем сколько контура в краях (20% по сторонам)
      const edgeLeftPart = Math.max(0, frameLeft - rectLeft);
      const edgeRightPart = Math.max(0, rectRight - frameRight);
      const edgeTopPart = Math.max(0, frameTop - rectTop);
      const edgeBottomPart = Math.max(0, rectBottom - frameBottom);

      const edgePixels =
        edgeLeftPart + edgeRightPart + edgeTopPart + edgeBottomPart;
      const edgePercentage = edgePixels / Math.max(rect.width + rect.height, 1);

      // Смешанный коэффициент: если много в краях - усиливаем приоритет х20, иначе х10
      if (edgePercentage > 0.3) {
        return 1.0 + (PRIORITY_EDGE - 1) * edgePercentage; // х20 за края
      } else {
        return 1.0 + (PRIORITY_INNER - 1) * (1 - outsidePercentage); // х10 внутри
      }
    },
    [getGuideRect],
  );

  const takePhoto = useCallback(async () => {
    if (!webcamRef.current) return;

    try {
      setProcessing(true);
      const videoEl = webcamRef.current.video;
      const videoWidth = videoEl.videoWidth;
      const videoHeight = videoEl.videoHeight;

      let savedContourData = null;
      if (lastContourRef.current) {
        const data32S = lastContourRef.current.data32S;
        if (data32S) {
          // Нормализуем координаты (0..1) относительно ширины/высоты анализа
          // Высота превью рассчитывалась как videoHeight * (ANALYSIS_WIDTH / videoWidth)
          const previewHeight = Math.floor(
            videoHeight * (ANALYSIS_WIDTH / videoWidth),
          );

          savedContourData = [];
          for (let i = 0; i < data32S.length; i += 2) {
            savedContourData.push(data32S[i] / ANALYSIS_WIDTH); // x нормализованный
            savedContourData.push(data32S[i + 1] / previewHeight); // y нормализованный
          }
        }
      }

      const imageSrc = webcamRef.current.getScreenshot({
        width: videoWidth,
        height: videoHeight,
      });

      setCapturedImage(imageSrc);

      const img = new Image();
      img.src = imageSrc;
      img.onload = () => {
        try {
          const resultDataUrl = cropDocumentWithNormalizedContour(
            img,
            savedContourData,
            videoWidth,
            videoHeight,
          );
          setProcessedImage(resultDataUrl);
          setProcessing(false);
        } catch (e) {
          console.error("Ошибка обработки с сохраненным контуром:", e);
          try {
            const retryResult = findAndCropDocument(img);
            setProcessedImage(retryResult);
          } catch (retryError) {
            console.warn("Повторный поиск не дал результатов:", retryError);
            message.warning(
              "Не удалось найти границы документа. Сохранено как есть.",
            );
            setProcessedImage(imageSrc);
          }
          setProcessing(false);
        }
      };
    } catch (err) {
      console.error(err);
      message.error("Ошибка при захвате изображения");
      setProcessing(false);
    }
  }, [cropDocumentWithNormalizedContour, findAndCropDocument, webcamRef]);

  // Новая функция обрезки через нормализованные координаты
  function cropDocumentWithNormalizedContour(
    imgElement,
    normalizedContour,
    originalWidth,
    originalHeight,
  ) {
    const cv = window.cv;
    const src = cv.imread(imgElement);

    if (!normalizedContour || normalizedContour.length !== 8) {
      src.delete();
      throw new Error("Нет сохраненного контура");
    }

    try {
      const corners = [];
      for (let i = 0; i < 4; i++) {
        corners.push({
          x: normalizedContour[i * 2] * originalWidth,
          y: normalizedContour[i * 2 + 1] * originalHeight,
        });
      }

      // Надежная сортировка углов
      const center = corners.reduce(
        (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
        { x: 0, y: 0 },
      );
      center.x /= 4;
      center.y /= 4;

      const topPoints = corners
        .filter((p) => p.y < center.y)
        .sort((a, b) => a.x - b.x);
      const bottomPoints = corners
        .filter((p) => p.y >= center.y)
        .sort((a, b) => a.x - b.x);

      let tl, tr, br, bl;

      if (topPoints.length === 2 && bottomPoints.length === 2) {
        tl = topPoints[0];
        tr = topPoints[1];
        bl = bottomPoints[0];
        br = bottomPoints[1];
      } else {
        const sum = corners.map((p) => p.x + p.y);
        const diff = corners.map((p) => p.y - p.x);
        tl = corners[sum.indexOf(Math.min(...sum))];
        br = corners[sum.indexOf(Math.max(...sum))];
        tr = corners[diff.indexOf(Math.min(...diff))];
        bl = corners[diff.indexOf(Math.max(...diff))];
      }

      const widthA = Math.sqrt(
        Math.pow(br.x - bl.x, 2) + Math.pow(br.y - bl.y, 2),
      );
      const widthB = Math.sqrt(
        Math.pow(tr.x - tl.x, 2) + Math.pow(tr.y - tl.y, 2),
      );
      const maxWidth = Math.max(widthA, widthB);

      const heightA = Math.sqrt(
        Math.pow(tr.x - br.x, 2) + Math.pow(tr.y - br.y, 2),
      );
      const heightB = Math.sqrt(
        Math.pow(tl.x - bl.x, 2) + Math.pow(tl.y - bl.y, 2),
      );
      const maxHeight = Math.max(heightA, heightB);

      const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
        tl.x,
        tl.y,
        tr.x,
        tr.y,
        br.x,
        br.y,
        bl.x,
        bl.y,
      ]);
      const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
        0,
        0,
        maxWidth,
        0,
        maxWidth,
        maxHeight,
        0,
        maxHeight,
      ]);

      const M = cv.getPerspectiveTransform(srcTri, dstTri);
      const dst = new cv.Mat();

      cv.warpPerspective(
        src,
        dst,
        M,
        new cv.Size(maxWidth, maxHeight),
        cv.INTER_LINEAR,
        cv.BORDER_CONSTANT,
        new cv.Scalar(),
      );

      const outputCanvas = document.createElement("canvas");
      cv.imshow(outputCanvas, dst);

      src.delete();
      dst.delete();
      M.delete();
      srcTri.delete();
      dstTri.delete();

      return outputCanvas.toDataURL("image/jpeg", 0.9);
    } catch (e) {
      src.delete();
      throw e;
    }
  }

  useEffect(() => {
    let intervalId;

    const detectDocument = () => {
      if (
        !webcamRef.current ||
        !webcamRef.current.video ||
        !cvReady ||
        capturedImage ||
        processing
      )
        return;

      try {
        const video = webcamRef.current.video;
        if (video.readyState !== 4) return;

        const cv = window.cv;
        const width = ANALYSIS_WIDTH;
        const height = Math.floor(
          video.videoHeight * (width / video.videoWidth),
        );

        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = width;
        tempCanvas.height = height;
        const ctx = tempCanvas.getContext("2d");
        ctx.drawImage(video, 0, 0, width, height);

        const src = cv.imread(tempCanvas);
        const gray = new cv.Mat();
        const blur = new cv.Mat();
        const edged = new cv.Mat();

        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
        // 1. Размываем сильнее (7x7), чтобы скрыть мягкие тени (складки) и шум текста
        cv.GaussianBlur(gray, blur, new cv.Size(7, 7), 0, 0, cv.BORDER_DEFAULT);

        // 2. Canny 20-80: Чуть строже, чтобы игнорировать складки, но видеть края листа
        cv.Canny(blur, edged, 20, 80);

        // 3. Сначала закрываем разрывы (5x5) - лечим блики на карточках
        const closeKernel = cv.getStructuringElement(
          cv.MORPH_RECT,
          new cv.Size(5, 5),
        );
        cv.morphologyEx(edged, edged, cv.MORPH_CLOSE, closeKernel);

        // 4. Дилатация (3x3) - немного расширяем
        const dilateKernel = cv.getStructuringElement(
          cv.MORPH_RECT,
          new cv.Size(3, 3),
        );
        cv.dilate(edged, edged, dilateKernel);

        dilateKernel.delete();
        closeKernel.delete();

        const contours = new cv.MatVector();
        const hierarchy = new cv.Mat();
        // ВАЖНО: Используем RETR_LIST, чтобы видеть документы, лежащие ВНУТРИ контура стола.
        // RETR_EXTERNAL видел только стол и игнорировал документ.
        cv.findContours(
          edged,
          contours,
          hierarchy,
          cv.RETR_LIST,
          cv.CHAIN_APPROX_SIMPLE,
        );

        let maxScore = 0;
        let bestContour = null;

        const centerX = width / 2;
        const centerY = height / 2;

        for (let i = 0; i < contours.size(); ++i) {
          const contour = contours.get(i);
          const area = cv.contourArea(contour);

          // 1. Фильтр площади: Разрешаем от 1% экрана (мелкие карточки)
          if (area < (width * height) / 100 || area > width * height * 0.99)
            continue;

          const areaRatio = area / (width * height);

          // 2. Фильтр границ: Увеличиваем отступ до 20px
          const rect = cv.boundingRect(contour);
          const margin = 20;
          let bordersTouched = 0;
          if (rect.x <= margin) bordersTouched++;
          if (rect.y <= margin) bordersTouched++;
          if (rect.x + rect.width >= width - margin) bordersTouched++;
          if (rect.y + rect.height >= height - margin) bordersTouched++;

          // Штрафы
          let borderTouchPenalty = 1.0;
          if (bordersTouched >= 3)
            borderTouchPenalty = 0.02; // Почти бан
          else if (bordersTouched === 2)
            borderTouchPenalty = 0.1; // Сильный штраф
          else if (bordersTouched === 1) borderTouchPenalty = 0.5; // Умеренный штраф

          // Штраф за слишком большую площадь (скорее всего это стол или фон)
          let areaPenalty = 1.0;
          if (areaRatio > 0.65 && bordersTouched > 0) {
            areaPenalty = 0.2;
          }
          if (areaRatio > 0.85) {
            areaPenalty = 0.1;
          }

          const peri = cv.arcLength(contour, true);
          const approx = new cv.Mat();
          // Ослабляем аппроксимацию до 0.05 (было 0.03) чтобы прощать неровности (складки)
          cv.approxPolyDP(contour, approx, 0.05 * peri, true);

          if (approx.rows >= 4 && approx.rows <= 12) {
            let M = cv.moments(contour);
            let cX = M.m10 / M.m00;
            let cY = M.m01 / M.m00;

            const dist = Math.sqrt(
              Math.pow(cX - centerX, 2) + Math.pow(cY - centerY, 2),
            );
            const maxDist =
              Math.sqrt(Math.pow(width, 2) + Math.pow(height, 2)) / 2;

            // Радикально усиливаем вес центра (x5)
            // Это заставит алгоритм игнорировать тени по бокам и фокусироваться на том,
            // что находится в перекрестии прицела.
            const centralityFactor = 1 + Math.pow(1 - dist / maxDist, 3) * 5;

            let rotatedRect = cv.minAreaRect(contour);
            let ratio = rotatedRect.size.width / rotatedRect.size.height;
            if (ratio < 1) ratio = 1 / ratio;

            let aspectScore = 1;
            if (ratio > 3.5) {
              aspectScore = 0.2;
            }

            // Применяем весовой коэффициент рамки приоритета
            const framePriority = calculateFramePenalty(contour, width, height);

            // Используем корень из площади, чтобы уменьшить преимущество огромных объектов (фона) перед маленькими (карточками)
            const score =
              Math.sqrt(areaRatio) *
              centralityFactor *
              aspectScore *
              borderTouchPenalty *
              areaPenalty *
              framePriority;

            if (score > maxScore) {
              maxScore = score;
              if (bestContour) bestContour.delete();

              if (approx.rows > 4) {
                const points = [];
                for (let j = 0; j < approx.rows; j++) {
                  points.push({
                    x: approx.data32S[j * 2],
                    y: approx.data32S[j * 2 + 1],
                  });
                }

                const sum = points.map((p) => p.x + p.y);
                const diff = points.map((p) => p.y - p.x);

                const tl = points[sum.indexOf(Math.min(...sum))];
                const br = points[sum.indexOf(Math.max(...sum))];
                const tr = points[diff.indexOf(Math.min(...diff))];
                const bl = points[diff.indexOf(Math.max(...diff))];

                const fourPointContour = cv.matFromArray(4, 1, cv.CV_32SC2, [
                  tl.x,
                  tl.y,
                  tr.x,
                  tr.y,
                  br.x,
                  br.y,
                  bl.x,
                  bl.y,
                ]);

                bestContour = fourPointContour;
              } else {
                bestContour = approx.clone();
              }
            }
          }
          approx.delete();
        }

        let contourToDraw = null;

        if (bestContour) {
          if (lastContourRef.current) lastContourRef.current.delete();
          lastContourRef.current = bestContour.clone();
          contourToDraw = bestContour;
          stableCounterRef.current += 1;
        } else {
          if (stableCounterRef.current > 0) {
            stableCounterRef.current -= 1;
            if (stableCounterRef.current > 0 && lastContourRef.current) {
              contourToDraw = lastContourRef.current;
            }
          }
        }

        const isVeryStable = stableCounterRef.current > 6;
        setIsStable(isVeryStable);

        const overlayCanvas = canvasRef.current;
        if (overlayCanvas) {
          overlayCanvas.width = video.clientWidth;
          overlayCanvas.height = video.clientHeight;
          const ctxOverlay = overlayCanvas.getContext("2d");
          ctxOverlay.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

          // Рисуем затемнение за пределами рамки приоритета
          const guideRect = getGuideRect(
            overlayCanvas.width,
            overlayCanvas.height,
          );
          const frameLeft = guideRect.x;
          const frameTop = guideRect.y;
          const frameWidth = guideRect.width;
          const frameHeight = guideRect.height;

          // Затемняем пространство за пределами рамки
          ctxOverlay.fillStyle = "rgba(0, 0, 0, 0.3)";
          ctxOverlay.fillRect(0, 0, frameLeft, overlayCanvas.height);
          ctxOverlay.fillRect(
            frameLeft + frameWidth,
            0,
            overlayCanvas.width - (frameLeft + frameWidth),
            overlayCanvas.height,
          );
          ctxOverlay.fillRect(frameLeft, 0, frameWidth, frameTop);
          ctxOverlay.fillRect(
            frameLeft,
            frameTop + frameHeight,
            frameWidth,
            overlayCanvas.height - (frameTop + frameHeight),
          );

          // Рисуем рамку приоритета
          ctxOverlay.strokeStyle = "rgba(255, 255, 255, 0.5)";
          ctxOverlay.lineWidth = 2;
          ctxOverlay.setLineDash([5, 5]); // Штрихованная линия
          ctxOverlay.strokeRect(frameLeft, frameTop, frameWidth, frameHeight);
          ctxOverlay.setLineDash([]); // Убираем штриховку

          if (isPassportMode) {
            const drawLabel = (text, x, y) => {
              const paddingX = 8;
              ctxOverlay.font = "12px sans-serif";
              const textWidth = ctxOverlay.measureText(text).width;
              const labelWidth = textWidth + paddingX * 2;
              ctxOverlay.fillStyle = "rgba(0,0,0,0.55)";
              ctxOverlay.fillRect(x - labelWidth / 2, y, labelWidth, 20);
              ctxOverlay.fillStyle = "#fff";
              ctxOverlay.fillText(text, x - textWidth / 2, y + 14);
            };

            // Линия сгиба/разделения
            ctxOverlay.beginPath();
            ctxOverlay.strokeStyle = "rgba(255,255,255,0.7)";
            ctxOverlay.lineWidth = 1.5;
            ctxOverlay.setLineDash([7, 6]);

            if (isVerticalPassportGuide) {
              ctxOverlay.moveTo(frameLeft, frameTop + frameHeight / 2);
              ctxOverlay.lineTo(
                frameLeft + frameWidth,
                frameTop + frameHeight / 2,
              );
              const topLabelY = Math.max(6, frameTop - 26);
              const bottomLabelY = Math.min(
                overlayCanvas.height - 24,
                frameTop + frameHeight + 6,
              );
              drawLabel("Фото и ФИО", frameLeft + frameWidth / 2, topLabelY);
              drawLabel(
                "Серия и номер",
                frameLeft + frameWidth / 2,
                bottomLabelY,
              );
            } else {
              ctxOverlay.moveTo(frameLeft + frameWidth / 2, frameTop);
              ctxOverlay.lineTo(
                frameLeft + frameWidth / 2,
                frameTop + frameHeight,
              );
              const labelTop = Math.max(6, frameTop - 26);
              drawLabel("Фото и ФИО", frameLeft + frameWidth * 0.25, labelTop);
              drawLabel(
                "Серия и номер",
                frameLeft + frameWidth * 0.75,
                labelTop,
              );
            }

            ctxOverlay.stroke();
            ctxOverlay.setLineDash([]);
          }

          if (contourToDraw && !isPassportMode) {
            const scaleX = overlayCanvas.width / width;
            const scaleY = overlayCanvas.height / height;

            ctxOverlay.beginPath();
            ctxOverlay.strokeStyle = isVeryStable ? "#00ff00" : "#faad14";
            ctxOverlay.lineWidth = 3;

            const data = contourToDraw.data32S;
            ctxOverlay.moveTo(data[0] * scaleX, data[1] * scaleY);
            for (let i = 2; i < data.length; i += 2) {
              ctxOverlay.lineTo(data[i] * scaleX, data[i + 1] * scaleY);
            }
            ctxOverlay.closePath();
            ctxOverlay.stroke();

            ctxOverlay.fillStyle = isVeryStable
              ? "rgba(0, 255, 0, 0.2)"
              : "rgba(250, 173, 20, 0.1)";
            ctxOverlay.fill();
          }
        }

        src.delete();
        gray.delete();
        blur.delete();
        edged.delete();
        contours.delete();
        hierarchy.delete();
        if (bestContour) bestContour.delete();
      } catch (e) {
        console.error(e);
      }
    };

    if (cvReady && !capturedImage) {
      intervalId = setInterval(detectDocument, 200);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (lastContourRef.current) {
        lastContourRef.current.delete();
        lastContourRef.current = null;
      }
    };
  }, [
    cvReady,
    capturedImage,
    processing,
    calculateFramePenalty,
    getGuideRect,
    isPassportMode,
    isVerticalPassportGuide,
  ]);

  function findAndCropDocument(imgElement) {
    try {
      const cv = window.cv;
      const src = cv.imread(imgElement);
      const gray = new cv.Mat();
      const blur = new cv.Mat();
      const edged = new cv.Mat();

      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
      // Те же настройки для финалльной обработки: Blur 7x7, Canny 20-80
      cv.GaussianBlur(gray, blur, new cv.Size(7, 7), 0, 0, cv.BORDER_DEFAULT);

      const closeKernel = cv.getStructuringElement(
        cv.MORPH_RECT,
        new cv.Size(5, 5),
      );
      cv.morphologyEx(blur, blur, cv.MORPH_CLOSE, closeKernel);

      cv.Canny(blur, edged, 20, 80);

      const dilateKernel = cv.getStructuringElement(
        cv.MORPH_RECT,
        new cv.Size(3, 3),
      );
      cv.dilate(edged, edged, dilateKernel);

      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();
      cv.findContours(
        edged,
        contours,
        hierarchy,
        cv.RETR_LIST,
        cv.CHAIN_APPROX_SIMPLE,
      );

      let maxScore = 0;
      let docContour = null;

      const width = src.cols;
      const height = src.rows;
      const centerX = width / 2;
      const centerY = height / 2;
      const maxDist = Math.sqrt(Math.pow(width, 2) + Math.pow(height, 2)) / 2;

      for (let i = 0; i < contours.size(); ++i) {
        const contour = contours.get(i);
        const area = cv.contourArea(contour);

        // Снижаем порог площади для финальной обработки тоже (0.5% от 4К ~ 40000px)
        if (area < 20000) continue;

        const peri = cv.arcLength(contour, true);
        const approx = new cv.Mat();
        cv.approxPolyDP(contour, approx, 0.05 * peri, true);

        // Расчет рейтинга контура (Центр + Площадь)
        let M = cv.moments(contour);
        let cX = M.m10 / M.m00;
        let cY = M.m01 / M.m00;
        const dist = Math.sqrt(
          Math.pow(cX - centerX, 2) + Math.pow(cY - centerY, 2),
        );
        const centralityFactor = 1 + Math.pow(1 - dist / maxDist, 3) * 5;

        const areaRatio = area / (width * height);

        // Проверка границ для финального кропа
        const rect = cv.boundingRect(contour);
        // Увеличиваем маржин до 30px или 5% ширины
        const margin = Math.max(30, width * 0.05);
        let bordersTouched = 0;
        if (rect.x <= margin) bordersTouched++;
        if (rect.y <= margin) bordersTouched++;
        if (rect.x + rect.width >= width - margin) bordersTouched++;
        if (rect.y + rect.height >= height - margin) bordersTouched++;

        let borderTouchPenalty = 1.0;
        // Если касается 2+ сторон - это точно фон/стол. Убиваем рейтинг.
        if (bordersTouched >= 2) borderTouchPenalty = 0.05;
        else if (bordersTouched === 1) borderTouchPenalty = 0.5;

        let areaPenalty = 1.0;
        // Если больше 75% - это стол. Убиваем.
        if (areaRatio > 0.75) areaPenalty = 0.05;
        // Если больше 60% и касается хотя бы 1 края - тоже убиваем.
        else if (areaRatio > 0.6 && bordersTouched > 0) areaPenalty = 0.1;

        // Применяем весовой коэффициент рамки приоритета
        const framePriority = calculateFramePenalty(contour, width, height);

        // Возвращаем линейную зависимость от Area (без корня), но с жесткими лимитами
        // Это даст приоритет нормальному листу (40%) перед визиткой (5%),
        // НО "стол" (80%) умрет из-за areaPenalty.
        const score =
          areaRatio *
          centralityFactor *
          areaPenalty *
          borderTouchPenalty *
          framePriority;

        if (approx.rows === 4 && score > maxScore) {
          maxScore = score;
          if (docContour) docContour.delete();
          docContour = approx;
        } else {
          const roughApprox = new cv.Mat();
          cv.approxPolyDP(contour, roughApprox, 0.06 * peri, true);
          if (roughApprox.rows === 4 && score > maxScore) {
            maxScore = score;
            if (docContour) docContour.delete();
            docContour = roughApprox;
          } else {
            roughApprox.delete();
            approx.delete();
          }
        }
      }

      gray.delete();
      blur.delete();
      edged.delete();
      contours.delete();
      hierarchy.delete();
      dilateKernel.delete();

      if (!docContour) {
        src.delete();
        throw new Error("Документ не найден");
      }

      const corners = [];
      for (let i = 0; i < 4; i++) {
        corners.push({
          x: docContour.data32S[i * 2],
          y: docContour.data32S[i * 2 + 1],
        });
      }
      docContour.delete();

      const sum = corners.map((p) => p.x + p.y);
      const diff = corners.map((p) => p.y - p.x);

      const tl = corners[sum.indexOf(Math.min(...sum))];
      const br = corners[sum.indexOf(Math.max(...sum))];
      const tr = corners[diff.indexOf(Math.min(...diff))];
      const bl = corners[diff.indexOf(Math.max(...diff))];

      const widthA = Math.sqrt(
        Math.pow(br.x - bl.x, 2) + Math.pow(br.y - bl.y, 2),
      );
      const widthB = Math.sqrt(
        Math.pow(tr.x - tl.x, 2) + Math.pow(tr.y - tl.y, 2),
      );
      const maxWidth = Math.max(widthA, widthB);

      const heightA = Math.sqrt(
        Math.pow(tr.x - br.x, 2) + Math.pow(tr.y - br.y, 2),
      );
      const heightB = Math.sqrt(
        Math.pow(tl.x - bl.x, 2) + Math.pow(tl.y - bl.y, 2),
      );
      const maxHeight = Math.max(heightA, heightB);

      const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
        tl.x,
        tl.y,
        tr.x,
        tr.y,
        br.x,
        br.y,
        bl.x,
        bl.y,
      ]);
      const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
        0,
        0,
        maxWidth,
        0,
        maxWidth,
        maxHeight,
        0,
        maxHeight,
      ]);

      const M = cv.getPerspectiveTransform(srcTri, dstTri);
      const dst = new cv.Mat();

      cv.warpPerspective(
        src,
        dst,
        M,
        new cv.Size(maxWidth, maxHeight),
        cv.INTER_LINEAR,
        cv.BORDER_CONSTANT,
        new cv.Scalar(),
      );

      const outputCanvas = document.createElement("canvas");
      cv.imshow(outputCanvas, dst);

      src.delete();
      dst.delete();
      M.delete();
      srcTri.delete();
      dstTri.delete();

      return outputCanvas.toDataURL("image/jpeg", 0.9);
    } catch (e) {
      console.error("OpenCV error: ", e);
      throw e;
    }
  }

  const handleCapture = useCallback(() => {
    takePhoto();
  }, [takePhoto]);

  const handleSave = () => {
    if (processedImage) {
      fetch(processedImage)
        .then((res) => res.blob())
        .then((blob) => {
          onCapture(blob);
          onCancel();
        });
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
    setProcessedImage(null);
    lastContourRef.current = null;
    stableCounterRef.current = 0;
    setIsStable(false);
  };

  return (
    <Modal
      title={isPassportMode ? "Фото паспорта" : "Сканирование документа"}
      open={visible}
      onCancel={onCancel}
      afterOpenChange={handleModalVisibilityChange}
      footer={null}
      width={isMobileViewport ? "100vw" : 800}
      centered={!isMobileViewport}
      style={
        isMobileViewport
          ? { top: 0, paddingBottom: 0, maxWidth: "100vw" }
          : undefined
      }
      styles={{
        body: {
          padding: 0,
          height: isMobileViewport ? "calc(100vh - 56px)" : undefined,
        },
      }}
      destroyOnHidden
    >
      <div
        style={{
          minHeight: isMobileViewport ? "calc(100vh - 56px)" : 400,
          background: "#000",
          position: "relative",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          overflow: "hidden",
        }}
      >
        {loading && !cvReady && (
          <div style={{ color: "#fff", textAlign: "center" }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}>
              Загрузка модулей компьютерного зрения...
            </div>
          </div>
        )}

        {error && (
          <div style={{ padding: 20, width: "100%" }}>
            <Alert message="Ошибка" description={error} type="error" showIcon />
          </div>
        )}

        {!capturedImage && !loading && !error && (
          <>
            <div
              style={{
                position: "absolute",
                top: 12,
                left: 12,
                right: 12,
                zIndex: 2,
              }}
            >
              <Alert
                type="info"
                showIcon
                message={
                  isPassportMode
                    ? isVerticalPassportGuide
                      ? "Держите телефон вертикально. Совместите разворот паспорта с рамкой."
                      : "Снимите основной разворот паспорта: обе страницы целиком, без бликов."
                    : "Совместите документ с пунктирной рамкой."
                }
                style={{
                  background: "rgba(0, 0, 0, 0.45)",
                  border: "1px solid rgba(255,255,255,0.3)",
                  color: "#fff",
                }}
              />
            </div>

            <Webcam
              audio={false}
              ref={webcamRef}
              screenshotFormat="image/jpeg"
              videoConstraints={{
                facingMode: "environment",
                width: { ideal: 3840 },
                height: { ideal: 2160 },
              }}
              style={{
                width: "100%",
                height: "100%",
                objectFit: isMobileViewport ? "cover" : "contain",
                maxHeight: isMobileViewport ? "calc(100vh - 56px)" : "70vh",
              }}
            />

            <canvas
              ref={canvasRef}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
              }}
            />

            <div
              style={{
                position: "absolute",
                bottom: isMobileViewport ? 28 : 20,
                width: "100%",
                display: "flex",
                justifyContent: "center",
              }}
            >
              <Button
                type="primary"
                shape="circle"
                size="large"
                icon={<CameraOutlined style={{ fontSize: 32 }} />}
                style={{
                  width: 80,
                  height: 80,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                  border:
                    !isPassportMode && isStable ? "4px solid #52c41a" : "none",
                }}
                onClick={handleCapture}
                loading={processing}
              />
            </div>
          </>
        )}

        {processedImage && (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <img
              src={processedImage}
              alt="Result"
              style={{
                maxWidth: "100%",
                maxHeight: "60vh",
                objectFit: "contain",
                margin: "auto",
              }}
            />

            <div
              style={{
                padding: 16,
                width: "100%",
                background: "#fff",
                display: "flex",
                justifyContent: "center",
                gap: 16,
              }}
            >
              <Button icon={<RotateRightOutlined />} onClick={handleRetake}>
                Переснять
              </Button>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={handleSave}
              >
                Сохранить
              </Button>
            </div>
          </div>
        )}

        {processing && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0,0,0,0.7)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              zIndex: 10,
            }}
          >
            <Spin size="large" />
            <div style={{ color: "#fff", marginTop: 16 }}>
              Обработка и поиск границ...
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
