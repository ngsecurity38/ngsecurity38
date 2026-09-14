/** Mise en forme des nombres à la française, partagée par les modules. */

export const arrondir = (v, n = 1) => {
  const f = 10 ** n;
  return Math.round(v * f) / f;
};

/** « 6,4 » plutôt que « 6.4 » : ces valeurs sont lues sur le terrain. */
export const fr = (v, n = 1) => String(arrondir(v, n)).replace('.', ',');

/** Idem, avec le signe explicite : un écart se lit « +2,4 » ou « −1,1 ». */
export const signe = (v, n = 1) => (v > 0 ? `+${fr(v, n)}` : fr(v, n));
