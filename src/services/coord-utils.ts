/**
 * 坐标转换工具
 * 用于在客户端坐标、归一化坐标和设备坐标之间转换
 */

/**
 * 将客户端坐标转换为归一化坐标 (0-1)
 * @param clientX 客户端 X 坐标
 * @param clientY 客户端 Y 坐标
 * @param element 目标 HTML 元素
 * @returns 归一化坐标 { x, y }，范围 [0, 1]
 */
export function clientToNormalized(
  clientX: number,
  clientY: number,
  element: HTMLElement
): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  
  // 计算相对于元素的坐标
  const relativeX = clientX - rect.left;
  const relativeY = clientY - rect.top;
  
  // 归一化到 0-1 范围，并限制在有效范围内
  const x = Math.max(0, Math.min(1, relativeX / rect.width));
  const y = Math.max(0, Math.min(1, relativeY / rect.height));
  
  return { x, y };
}

/**
 * 将归一化坐标转换为设备像素坐标
 * @param normalizedX 归一化 X 坐标 (0-1)
 * @param normalizedY 归一化 Y 坐标 (0-1)
 * @param deviceWidth 设备宽度（像素）
 * @param deviceHeight 设备高度（像素）
 * @param rotation 设备旋转角度 (0, 1, 2, 3 对应 0°, 90°, 180°, 270°)
 * @returns 设备像素坐标 { x, y }
 */
export function normalizedToDevice(
  normalizedX: number,
  normalizedY: number,
  deviceWidth: number,
  deviceHeight: number,
  rotation: number = 0
): { x: number; y: number } {
  let x: number;
  let y: number;

  // 根据旋转角度转换坐标
  switch (rotation) {
    case 0: // 0° - 正常方向
      x = normalizedX * deviceWidth;
      y = normalizedY * deviceHeight;
      break;
    case 1: // 90° - 顺时针旋转
      x = normalizedY * deviceWidth;
      y = (1 - normalizedX) * deviceHeight;
      break;
    case 2: // 180° - 倒置
      x = (1 - normalizedX) * deviceWidth;
      y = (1 - normalizedY) * deviceHeight;
      break;
    case 3: // 270° - 逆时针旋转
      x = (1 - normalizedY) * deviceWidth;
      y = normalizedX * deviceHeight;
      break;
    default:
      x = normalizedX * deviceWidth;
      y = normalizedY * deviceHeight;
  }

  // 确保坐标在设备范围内
  x = Math.max(0, Math.min(deviceWidth, Math.round(x)));
  y = Math.max(0, Math.min(deviceHeight, Math.round(y)));

  return { x, y };
}

/**
 * 验证归一化坐标是否在有效范围内
 * @param x 归一化 X 坐标
 * @param y 归一化 Y 坐标
 * @returns 是否有效
 */
export function isValidNormalizedCoord(x: number, y: number): boolean {
  return (
    typeof x === 'number' &&
    typeof y === 'number' &&
    !isNaN(x) &&
    !isNaN(y) &&
    x >= 0 &&
    x <= 1 &&
    y >= 0 &&
    y <= 1
  );
}
