declare module 'pdfmake/build/pdfmake' {
    interface PdfMakeTable {
        headerRows?: number;
        widths?: (string | number)[];
        body: unknown[][];
    }

    interface PdfMakeTableLayout {
        layout?: string | Record<string, unknown>;
        table: PdfMakeTable;
    }

    interface PdfMakeContentText {
        text: string;
        style?: string;
        margin?: number[];
        fontSize?: number;
        bold?: boolean;
        color?: string;
        alignment?: 'left' | 'center' | 'right' | 'justify';
    }

    interface PdfMakeDocumentDefinitions {
        content: (PdfMakeContentText | PdfMakeTableLayout | string)[];
        styles?: Record<string, Partial<PdfMakeContentText>>;
        defaultStyle?: Partial<PdfMakeContentText>;
        pageOrientation?: 'portrait' | 'landscape';
        pageSize?: string;
        pageMargins?: number[];
    }

    interface PdfMakeCreatedDocument {
        download(filename?: string): void;
        getBlob(): Promise<Blob>;
        open(): void;
        print(): void;
    }

    interface PdfMakeInstance {
        createPdf(doc: PdfMakeDocumentDefinitions): PdfMakeCreatedDocument;
        addVirtualFileSystem(vfs: Record<string, string>): void;
        addFontContainer(name: string, vfs: Record<string, string>): void;
        vfs: Record<string, string>;
    }

    const pdfMake: PdfMakeInstance;
    export default pdfMake;
}

declare module 'pdfmake/build/vfs_fonts' {
    const vfs: Record<string, string>;
    export default vfs;
}
