from ..errors import PlanError
from .fal import FalProvider
from .mock import MockProvider
from .replicate import ReplicateProvider

REGISTRY = {"mock": MockProvider, "fal": FalProvider, "replicate": ReplicateProvider}
ORDER = ["fal", "replicate"]   # real providers, preferred first


def make_provider(name, http=None, config=None, **kw):
    if name not in REGISTRY:
        raise PlanError(f"unknown provider {name!r}; choose from {', '.join(REGISTRY)}")
    return REGISTRY[name](http=http, config=config, **kw)
