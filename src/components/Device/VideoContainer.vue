<script setup lang="ts">
import { ref, onMounted, onUnmounted, provide, nextTick } from 'vue';
import {
    AndroidMotionEventAction,
    AndroidMotionEventButton,
    ScrcpyPointerId,
    type ScrcpySetClipboardControlMessage,
} from '@yume-chan/scrcpy';
import client from '../Scrcpy/adb-client';
import state from '../Scrcpy/scrcpy-state';

const videoContainer = ref<HTMLDivElement | null>(null);
const videoWrapper = ref<HTMLDivElement | null>(null);
const isVideoContainerFocused = ref(false);
const isCanvasReady = ref(false);
const isFullyRendered = ref(false);
/** 视频流已就绪（有尺寸且 running），用于占位/铺满切换与淡入 */
const pictureReady = ref(false);
const videoFadedIn = ref(false);
const placeholderAspect = ref('9 / 16');
let layoutFadeRaf = 0;

const MOUSE_EVENT_BUTTON_TO_ANDROID_BUTTON = [
    AndroidMotionEventButton.Primary,
    AndroidMotionEventButton.Tertiary,
    AndroidMotionEventButton.Secondary,
    AndroidMotionEventButton.Back,
    AndroidMotionEventButton.Forward,
];

const activePointers = new Set<number>();

/** 键盘/滚轮等需要焦点，避免误触 */
const isReady = () => (
    !!state.scrcpy &&
    !!state.canvas &&
    isVideoContainerFocused.value &&
    isCanvasReady.value &&
    isFullyRendered.value
);

/** 触摸轨迹：不要求焦点，避免移出画布后因 blur/失焦导致收不到 up 而卡在按下状态 */
const touchPipelineReady = () => (
    !!state.scrcpy &&
    !!state.canvas &&
    isCanvasReady.value &&
    isFullyRendered.value
);

const isPointInCanvas = (clientX: number, clientY: number): boolean => {
    if (!state.canvas) return false;
    const rect = state.canvas.getBoundingClientRect();
    return (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
    );
};

const handleWheel = (e: WheelEvent) => {
    if (!isReady() || !isPointInCanvas(e.clientX, e.clientY)) return;
    videoContainer.value?.focus();
    e.preventDefault();
    e.stopPropagation();

    const { x, y } = state.clientPositionToDevicePosition(e.clientX, e.clientY);
    state.scrcpy?.controller!.injectScroll({
        videoWidth: state.width!,
        videoHeight: state.height!,
        pointerX: x,
        pointerY: y,
        scrollX: -e.deltaX / 100,
        scrollY: -e.deltaY / 100,
        buttons: 0,
    });
};

const injectTouch = (action: AndroidMotionEventAction, e: PointerEvent) => {
    if (!touchPipelineReady()) return;

    const { pointerType } = e;
    const pointerId: bigint =
        pointerType === 'mouse' ? ScrcpyPointerId.Finger : BigInt(e.pointerId);

    const { x, y } = state.clientPositionToDevicePosition(e.clientX, e.clientY);

    state.scrcpy?.controller?.injectTouch({
        action,
        pointerId,
        videoWidth: state.width!,
        videoHeight: state.height!,
        pointerX: x,
        pointerY: y,
        pressure: e.pressure,
        actionButton: MOUSE_EVENT_BUTTON_TO_ANDROID_BUTTON[e.button],
        buttons: e.buttons,
    });
};

const handlePointerDown = (e: PointerEvent) => {
    if (!touchPipelineReady() || !isPointInCanvas(e.clientX, e.clientY)) return;

    isVideoContainerFocused.value = true;
    state.fullScreenContainer?.focus();
    e.preventDefault();
    e.stopPropagation();

    (e.currentTarget as HTMLDivElement)?.setPointerCapture(e.pointerId);
    activePointers.add(e.pointerId);
    injectTouch(AndroidMotionEventAction.Down, e);
};

const handlePointerMove = (e: PointerEvent) => {
    const isDragging = activePointers.has(e.pointerId);
    if (isDragging) {
        if (!touchPipelineReady()) return;
    } else {
        if (!isReady() || !isPointInCanvas(e.clientX, e.clientY)) return;
    }

    e.preventDefault();
    e.stopPropagation();

    const action = isDragging && e.buttons !== 0
        ? AndroidMotionEventAction.Move
        : AndroidMotionEventAction.HoverMove;

    injectTouch(action, e);
};

const handlePointerUp = (e: PointerEvent) => {
    if (!touchPipelineReady()) return;

    const wasDragging = activePointers.has(e.pointerId);
    if (!wasDragging && !isPointInCanvas(e.clientX, e.clientY)) return;

    e.preventDefault();
    e.stopPropagation();

    activePointers.delete(e.pointerId);

    try {
        (e.currentTarget as HTMLDivElement)?.releasePointerCapture(e.pointerId);
    } catch {
        // pointer capture may already be released
    }

    injectTouch(AndroidMotionEventAction.Up, e);
};

const handlePointerLeave = (e: PointerEvent) => {
    if (!touchPipelineReady()) return;
    if (activePointers.has(e.pointerId)) return;

    injectTouch(AndroidMotionEventAction.HoverExit, e);
};

const handlePointerCancel = (e: PointerEvent) => {
    if (!touchPipelineReady()) return;

    if (activePointers.has(e.pointerId)) {
        activePointers.delete(e.pointerId);
        injectTouch(AndroidMotionEventAction.Up, e);
    }
};

/** 浏览器意外释放 capture 时补发 Up，防止设备端一直按住 */
const handleLostPointerCapture = (e: PointerEvent) => {
    if (!touchPipelineReady()) return;
    if (!activePointers.has(e.pointerId)) return;
    activePointers.delete(e.pointerId);
    injectTouch(AndroidMotionEventAction.Up, e);
};

const handleContextMenu = (e: MouseEvent) => {
    if (!isReady() || !isPointInCanvas(e.clientX, e.clientY)) return;
    e.preventDefault();
};

const sanitizeText = (text: string): string => {
    return text.replace(/[nN]$/g, '');
};

const handlePaste = async () => {
    if (!isReady() || !state.scrcpy || !state.scrcpy.controller) return;
    try {
        const clipboardText = await navigator.clipboard.readText();
        const sanitizedText = sanitizeText(clipboardText);

        const clipboardMessage: Omit<ScrcpySetClipboardControlMessage, 'type'> = {
            sequence: BigInt(0),
            paste: true,
            content: sanitizedText,
        };

        await state.scrcpy.controller.setClipboard(clipboardMessage);
    } catch (error) {
        console.error('粘贴到设备失败:', error);
    }
};

const handleKeyEvent = (e: KeyboardEvent) => {
    if (!isReady() || !state.keyboard) return;
    e.preventDefault();
    e.stopPropagation();

    const { type, code, ctrlKey, metaKey } = e;

    if (type === 'keydown' && (ctrlKey || metaKey)) {
        if (code === 'KeyV') {
            handlePaste();
            return;
        }
    }

    state.keyboard[type === 'keydown' ? 'down' : 'up'](code);
};

const handleFocus = () => {
    isVideoContainerFocused.value = true;
};

const handleBlur = () => {
    if (activePointers.size > 0) return;
    isVideoContainerFocused.value = false;
};

const checkRendering = () => {
    if (state.running) {
        isFullyRendered.value = true;
    }
    if (state.running && pictureReady.value && renderingCheckInterval !== undefined) {
        clearInterval(renderingCheckInterval);
        renderingCheckInterval = undefined;
    }
};

const syncPictureLayout = () => {
    if (state.width > 0 && state.height > 0) {
        placeholderAspect.value = `${state.width} / ${state.height}`;
    }
    const ready = !!(state.running && state.width > 0 && state.height > 0);
    if (ready) {
        if (!pictureReady.value) {
            pictureReady.value = true;
            nextTick(() => {
                state.updateVideoContainer();
                cancelAnimationFrame(layoutFadeRaf);
                layoutFadeRaf = requestAnimationFrame(() => {
                    state.updateVideoContainer();
                    layoutFadeRaf = requestAnimationFrame(() => {
                        videoFadedIn.value = true;
                    });
                });
            });
        }
    } else {
        pictureReady.value = false;
        videoFadedIn.value = false;
        placeholderAspect.value = '9 / 16';
    }
};

let renderingCheckInterval: ReturnType<typeof setInterval> | undefined;

const handleMouseEnter = () => {
    if (videoContainer.value) {
        videoContainer.value.focus();
        isVideoContainerFocused.value = true;
    }
};

const handleMouseLeave = () => {
    if (activePointers.size > 0) return;
    isVideoContainerFocused.value = false;
};

onMounted(() => {
    if (videoContainer.value) {
        videoContainer.value.addEventListener('wheel', handleWheel, { passive: false });
        videoContainer.value.addEventListener('focus', handleFocus);
        videoContainer.value.addEventListener('blur', handleBlur);
        videoContainer.value.addEventListener('mouseenter', handleMouseEnter);
        videoContainer.value.addEventListener('mouseleave', handleMouseLeave);
    }
    if (client.device && videoContainer.value) {
        state.setRendererContainer(videoContainer.value);
        void (async () => {
            await client.killScrcpyServerOnDevice();
            await new Promise<void>((r) => setTimeout(r, 200));
            const scrcpy = await state.start(client.device as any);
            if (!scrcpy) {
                return;
            }
            isCanvasReady.value = true;
            renderingCheckInterval = window.setInterval(() => {
                syncPictureLayout();
                checkRendering();
            }, 100);
        })();
    }

    window.addEventListener('keydown', handleKeyEvent);
    window.addEventListener('keyup', handleKeyEvent);
});

onUnmounted(() => {
    if (videoContainer.value) {
        videoContainer.value.removeEventListener('wheel', handleWheel);
        videoContainer.value.removeEventListener('focus', handleFocus);
        videoContainer.value.removeEventListener('blur', handleBlur);
        videoContainer.value.removeEventListener('mouseenter', handleMouseEnter);
        videoContainer.value.removeEventListener('mouseleave', handleMouseLeave);
    }
    window.removeEventListener('keydown', handleKeyEvent);
    window.removeEventListener('keyup', handleKeyEvent);
    if (renderingCheckInterval !== undefined) {
        clearInterval(renderingCheckInterval);
    }
    cancelAnimationFrame(layoutFadeRaf);
    activePointers.clear();
});

provide('setVideoContainerFocus', (focused: boolean) => {
    isVideoContainerFocused.value = focused;
});
</script>

<template>
    <div ref="videoWrapper" class="video-wrapper">
        <div
            ref="videoContainer"
            class="video-container"
            :class="{
                'video-container--placeholder': !pictureReady,
                'video-container--fade-in': videoFadedIn,
            }"
            :style="!pictureReady ? { aspectRatio: placeholderAspect } : undefined"
            tabindex="0"
            @pointerdown="handlePointerDown"
            @pointermove="handlePointerMove"
            @pointerup="handlePointerUp"
            @pointercancel="handlePointerCancel"
            @pointerleave="handlePointerLeave"
            @lostpointercapture="handleLostPointerCapture"
            @contextmenu="handleContextMenu"
        />
    </div>
</template>

<style scoped>
.video-wrapper {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    background: transparent;
}

.video-container {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
    background-color: rgba(24, 24, 27, 0.04);
    cursor: crosshair;
    overflow: hidden;
    outline: none;
    touch-action: none;
    transition: background-color 0.35s ease;
}

.video-container--placeholder {
    width: auto;
    height: 100%;
    max-height: 100%;
    max-width: 100%;
    flex-shrink: 0;
}

.video-container--fade-in {
    background-color: transparent;
}

.video-container :deep(canvas) {
    display: block;
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: auto !important;
    height: auto !important;
    max-width: calc(100% - 6px);
    max-height: calc(100% - 6px);
    background-color: transparent;
    border: 3px solid #303133;
    border-radius: 16px;
    box-sizing: border-box;
    padding: 0;
    margin: 0;
    opacity: 0;
    transition: opacity 0.45s ease;
}

.video-container--fade-in :deep(canvas) {
    opacity: 1;
}
</style>
