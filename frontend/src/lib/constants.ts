export type Family =
  | "gaussian"
  | "poisson"
  | "binomial"
  | "gamma"
  | "tweedie"
  | "quasipoisson"
  | "quasibinomial"
  | "negbinomial";

export type Link = "identity" | "log" | "logit" | "inverse";

export const CANONICAL_LINKS: Record<Family, Link> = {
  gaussian: "identity",
  poisson: "log",
  binomial: "logit",
  gamma: "log",
  tweedie: "log",
  quasipoisson: "log",
  quasibinomial: "logit",
  negbinomial: "log",
};

export const FAMILY_OPTIONS: { value: Family; label: string; description: string }[] = [
  { value: "poisson", label: "Poisson", description: "Count data, frequency models" },
  { value: "gamma", label: "Gamma", description: "Positive continuous, severity models" },
  { value: "tweedie", label: "Tweedie", description: "Mixed zero-and-positive, pure premium" },
  { value: "gaussian", label: "Gaussian", description: "Normal distribution, continuous" },
  { value: "binomial", label: "Binomial", description: "Binary outcome, propensity models" },
  { value: "negbinomial", label: "Negative Binomial", description: "Overdispersed counts" },
  { value: "quasipoisson", label: "Quasi-Poisson", description: "Overdispersed counts (quasi)" },
  { value: "quasibinomial", label: "Quasi-Binomial", description: "Overdispersed binary (quasi)" },
];

export const LINK_OPTIONS: { value: Link; label: string }[] = [
  { value: "log", label: "Log" },
  { value: "identity", label: "Identity" },
  { value: "logit", label: "Logit" },
  { value: "inverse", label: "Inverse" },
];
