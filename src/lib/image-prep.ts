/** Shrink phone photos before OCR so the vision API does not reject the first upload. */

const MAX_EDGE = 1600
const MAX_BYTES = 1_200_000
const JPEG_QUALITY = 0.82

function sniffImageKind(bytes: Uint8Array): 'jpeg' | 'png' | 'gif' | 'webp' | 'heic' | 'unknown' {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg'
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'png'
  }
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'gif'
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'webp'
  }
  if (bytes.length >= 12) {
    const box = String.fromCharCode(...bytes.slice(4, 8))
    const brand = String.fromCharCode(...bytes.slice(8, 12)).toLowerCase()
    if (box === 'ftyp' && /heic|heif|mif1|msf1/.test(brand)) return 'heic'
  }
  return 'unknown'
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('课表图片无法打开'))
    }
    img.src = url
  })
}

async function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
  if (!blob) throw new Error('课表图片压缩失败')
  return blob
}

export async function prepareTimetableImage(file: File): Promise<File> {
  if (typeof document === 'undefined') return file

  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  const kind = sniffImageKind(head)
  if (kind === 'heic') {
    throw new Error('这张是 iPhone 的 HEIC 照片，识别接口读不了。请在相册里先「导出 JPG」再导入。')
  }

  let source: ImageBitmap | HTMLImageElement
  try {
    source = await createImageBitmap(file)
  } catch {
    try {
      source = await loadImage(file)
    } catch {
      if (kind === 'unknown') {
        throw new Error('这张图格式不受支持。请另存为 jpg / png 后再导入课表。')
      }
      return file
    }
  }

  const width = 'width' in source ? source.width : 0
  const height = 'height' in source ? source.height : 0
  if (!width || !height) return file

  const scale = Math.min(1, MAX_EDGE / Math.max(width, height))
  const alreadySmall = file.size <= MAX_BYTES && scale === 1 && (file.type === 'image/jpeg' || kind === 'jpeg')
  if (alreadySmall) {
    if ('close' in source && typeof source.close === 'function') source.close()
    return file
  }

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  if ('close' in source && typeof source.close === 'function') source.close()

  const blob = await canvasToJpeg(canvas)
  const name = file.name.replace(/\.[a-z0-9]+$/i, '') + '.jpg'
  return new File([blob], name, { type: 'image/jpeg' })
}

export function explainOcrHttpError(status: number, fallback: string): string {
  if (status === 429) return '识别次数稍多，请稍后再试，或改用表格导入。'
  if (status === 413) return '课表图片太大。请裁一下或另存为较小的 jpg 再试。'
  if (status === 502 || status === 503 || status === 504) {
    return '识别服务暂时连不上。请稍后再试；过大的原图会先自动压缩。'
  }
  return fallback
}
