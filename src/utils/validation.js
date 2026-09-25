export const validateRut = (rut) => {
    if (rut == null || rut.length === 0) {
        return true;
    }

    rut = rut.split('.').join('');
    rut = rut.split('-').join('');

    // Valor acumulado para el calculo de la formula del dígito verificador
    let nAcumula = 0;
    // Factor por el cual se debe multiplicar el valor de la posicion
    let nFactor = 2;
    // Digito verificador
    let nDv = 0;
    let nDvReal;
    // Extraemos el ultimo numero o letra que corresponde al verificador
    // La K corresponde a 10
    if (rut.charAt(rut.length - 1).toUpperCase() === 'K' ) {
        nDvReal = 10;
    } else if (rut.charAt(rut.length - 1) === '0' || rut.charAt(rut.length - 1) === 0 ) { // el 0 corresponde a 11
        nDvReal = 11;
    } else {
        nDvReal = rut.charAt(rut.length - 1);
    }
    
    for (let nPos = rut.length - 2; nPos >= 0; nPos--) {
        nAcumula += parseInt(rut.charAt(nPos), 10) * nFactor;
        nFactor++;
        if (nFactor > 7) nFactor = 2;
    }

    nDv = 11 - (nAcumula % 11);
    if (nDv === parseInt(nDvReal, 10)) {
        return true;
    } else {
        return false;
    }
};

export const formatRut = (rut) => {
    if (!rut) return '';
    // Clean all non-alphanumeric (except K)
    let value = rut.replace(/[^0-9kK]/g, '');
    if (value.length === 0) return '';
    if (value.length === 1) return value.toUpperCase();
    
    let body = value.slice(0, -1);
    let dv = value.slice(-1).toUpperCase();
    
    // Format body with dots
    let formattedBody = '';
    while (body.length > 3) {
        formattedBody = '.' + body.slice(-3) + formattedBody;
        body = body.slice(0, -3);
    }
    formattedBody = body + formattedBody;
    
    return `${formattedBody}-${dv}`;
};

export const isValidDateDDMMYYYY = (dateStr) => {
    if (!dateStr || typeof dateStr !== 'string') return false;
    const trimmed = dateStr.trim();
    const match = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (!match) return false;
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);
    if (year < 1900 || year > 2100) return false;
    if (month < 1 || month > 12) return false;
    if (day < 1 || day > 31) return false;
    
    // Verify valid calendar date (e.g. leap years, 30 vs 31 days)
    const d = new Date(year, month - 1, day);
    return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
};

export const formatToDDMMYYYY = (dateStr) => {
    if (!dateStr) return '';
    if (typeof dateStr !== 'string') return '';
    if (dateStr.includes('/')) return dateStr;
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        if (parts[0].length === 4) {
            // YYYY-MM-DD -> DD/MM/YYYY
            return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
        } else {
            // DD-MM-YYYY -> DD/MM/YYYY
            return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
        }
    }
    return dateStr;
};

export const formatToIsoDate = (dateStr) => {
    if (!dateStr) return '';
    if (typeof dateStr !== 'string') return '';
    const match = dateStr.trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (!match) return dateStr;
    const day = String(parseInt(match[1], 10)).padStart(2, '0');
    const month = String(parseInt(match[2], 10)).padStart(2, '0');
    const year = match[3];
    return `${year}-${month}-${day}`;
};

export const addMonthsSafely = (dateStr, monthsToAdd) => {
    if (!dateStr) return '';
    let y, m, d;
    if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        d = parseInt(parts[0], 10);
        m = parseInt(parts[1], 10);
        y = parseInt(parts[2], 10);
    } else {
        const parts = dateStr.split('-');
        if (parts[0].length === 4) {
            y = parseInt(parts[0], 10);
            m = parseInt(parts[1], 10);
            d = parseInt(parts[2], 10);
        } else {
            d = parseInt(parts[0], 10);
            m = parseInt(parts[1], 10);
            y = parseInt(parts[2], 10);
        }
    }

    if (isNaN(y) || isNaN(m) || isNaN(d)) return dateStr;

    const tempDate = new Date(y, m - 1 + monthsToAdd, 1);
    const targetYear = tempDate.getFullYear();
    const targetMonth = tempDate.getMonth() + 1; // 1-indexed

    const maxDays = new Date(targetYear, targetMonth, 0).getDate();
    const targetDay = Math.min(d, maxDays);

    const pad = (n) => String(n).padStart(2, '0');
    return `${targetYear}-${pad(targetMonth)}-${pad(targetDay)}`;
};

