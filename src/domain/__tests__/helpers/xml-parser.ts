import { DOMParser as XMLDOMParser } from "@xmldom/xmldom";

/** Give Node tests a real XML DOM and browser-style parsererror documents. */
export class TestDOMParser {
  parseFromString(source: string, mimeType: string): Document {
    let invalid = false;
    const markInvalid = () => {
      invalid = true;
    };
    const parser = new XMLDOMParser({
      errorHandler: {
        warning: markInvalid,
        error: markInvalid,
        fatalError: markInvalid,
      },
    });
    let document: Document | undefined;
    try {
      document = parser.parseFromString(source, mimeType);
    } catch {
      invalid = true;
    }
    return invalid || !document?.documentElement
      ? new XMLDOMParser().parseFromString(
          "<parsererror>Invalid XML</parsererror>",
          "text/xml",
        )
      : document;
  }
}
