<div align="center">

# Atelier

**Browser-based GLM workbench for actuarial pricing**

Build, fit, diagnose, and iterate on Generalized Linear Models - without leaving your browser.

[![Python 3.13+](https://img.shields.io/badge/python-3.13+-3776ab.svg)](https://www.python.org/downloads/)
[![License: EPL-2.0](https://img.shields.io/badge/license-EPL--2.0-blue.svg)](LICENSE)
[![Powered by rustystats](https://img.shields.io/badge/engine-rustystats-e6522c.svg)](https://github.com/PricingFrontier/rustystats)

![Atelier Screenshot](docs/screenshot/screenshot.png)

</div>

---

## Why Atelier?

Atelier wraps [rustystats](https://github.com/PricingFrontier/rustystats) - a high-performance Rust-backed GLM engine - in a clean, interactive UI.

## Installation

```bash
uv add atel
# or
pip install atel
```

Installs everything - backend, frontend, engine. No separate build steps.

## Quick start

```bash
atel                  # starts server, opens browser
atel --port 9000      # custom port
```

The `atelier` command works too - `atel` is just shorter.

---

## Features

### Model building

- **8 GLM families** - Gaussian, Poisson, Binomial, Gamma, Tweedie, Quasi-Poisson, Quasi-Binomial, Negative Binomial
- **Rich term types** - categorical, linear, B-splines, natural splines, target encoding, frequency encoding, expressions
- **Monotonic constraints** - enforce increasing/decreasing effects on splines and linear terms
- **Interactions** - standard product terms, target-encoded interactions, frequency-encoded interactions
- **Regularization** - Ridge, Lasso, Elastic Net with cross-validated alpha selection
- **Train/test split** - holdout validation with stratified splitting

### Diagnostics

- **Factor-level A/E** - actual vs expected charts for every factor, fitted or not
- **Score tests** - chi-squared significance for candidate factors before fitting
- **Lift charts** - Gini, AUC, KS statistics with decile breakdown
- **Calibration** - Hosmer-Lemeshow test, decile calibration with confidence intervals
- **Residual analysis** - deviance, Pearson, and working residuals
- **VIF & multicollinearity** - variance inflation factors with severity coloring
- **Model comparison** - side-by-side metrics against a base model

### Data exploration

- **Pre-fit analysis** - response distribution, zero inflation, overdispersion detection
- **Correlation matrix** - numeric correlations and Cramér's V for categoricals
- **Interaction detection** - greedy residual-based search for potential interactions

---

## License

[Eclipse Public License 2.0](LICENSE)
