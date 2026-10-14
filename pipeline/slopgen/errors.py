class SlopError(Exception):
    """Base class; the CLI prints these without a traceback."""


class PlanError(SlopError):
    pass


class MissingSecret(SlopError):
    pass


class ProviderError(SlopError):
    """The provider answered with an error or something unusable."""


class AmbiguousSubmit(ProviderError):
    """A paid request may or may not have been accepted. Never resubmitted automatically."""
