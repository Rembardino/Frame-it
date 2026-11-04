const names = ['L. Rossi', 'M. Bianchi', 'A. Costa', 'E. Moretti', 'N. Laurent', 'D. Vega', 'J. Lind', 'S. Weber', 'P. Conti', 'F. Martin', 'R. Silva', 'T. Meyer', 'G. Neri', 'O. Dubois'];
export const riderName = (id: number) => names[id % names.length];
