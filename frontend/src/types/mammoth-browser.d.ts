// mammoth ships its browser bundle without TypeScript types — the library
// converts DOCX (arrayBuffer) to semantic HTML.
declare module 'mammoth/mammoth.browser' {
  export interface ConvertResult {
    value: string
    messages: { type: string; message: string }[]
  }
  export function convertToHtml(
    input: { arrayBuffer: ArrayBuffer },
    options?: Record<string, unknown>,
  ): Promise<ConvertResult>
}
