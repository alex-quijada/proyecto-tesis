const TEXTO_DUPLICADO =
    /already exists|duplicate key|already been registered|email_exists|already registered/i;

export function esErrorDuplicado(err: any): boolean {
    if (!err) return false;
    const texto = `${err?.code || ''} ${err?.details || ''} ${err?.message || ''} ${err?.hint || ''}`;
    return err?.code === '23505' || TEXTO_DUPLICADO.test(texto);
}

export function columnasEnError(err: any): string[] {
    const texto = `${err?.details || ''} ${err?.message || ''}`;
    const cols: string[] = [];
    const re = /\(([a-z_][a-z0-9_]*)\)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(texto)) !== null) {
        const col = m[1].toLowerCase();
        if (!cols.includes(col)) cols.push(col);
    }
    return cols;
}

export function traducirErrorDuplicado(
    err: any,
    mapa: Record<string, string>,
    fallback: string,
): string | null {
    if (!esErrorDuplicado(err)) return null;
    const cols = columnasEnError(err);
    for (const col of cols) {
        if (mapa[col]) return mapa[col];
    }
    return fallback;
}
