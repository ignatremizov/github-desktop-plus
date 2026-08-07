/**
 * A container for holding an image for display in the application
 */
export class Image {
  /**
   * @param rawContents The original bytes used by formats that need client-side
   *                    decoding or sanitization.
   * @param contents The base64 encoded contents of the image. SVG images leave
   *                 this empty until the renderer has sanitized their markup.
   * @param mediaType The data URI media type, so the browser can render the image correctly.
   * @param bytes Size of the file in bytes.
   */
  public constructor(
    public readonly rawContents: ArrayBufferLike,
    public readonly contents: string,
    public readonly mediaType: string,
    public readonly bytes: number
  ) {}
}
