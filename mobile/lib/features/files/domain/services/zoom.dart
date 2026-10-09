/// How far a pinch scales the text of a viewer (plan 25, B-16, D-07).
library;

/// The smallest the text gets: half.
const double minTextScale = 0.5;

/// The largest the text gets: three times.
const double maxTextScale = 3;

/// [scale], held between [minTextScale] and [maxTextScale] (S-64).
double clampTextScale(double scale) => scale.clamp(minTextScale, maxTextScale).toDouble();
