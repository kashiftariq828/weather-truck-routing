import logging

from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .clients.open_meteo import WeatherError
from .clients.tomtom import RoutingError, TomTomClient
from .serializers import PlanRequestSerializer
from .services import PlanNotFoundError, TripRequest, corridor_heatmap, plan_trip

logger = logging.getLogger(__name__)


MAX_QUERY_LEN = 200


def _upstream_error(exc: Exception) -> Response:
    if isinstance(exc, RoutingError) and exc.no_route:
        # The request is valid but can't be routed: the user needs to change it, not retry.
        return Response({"detail": str(exc)}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
    logger.warning("Upstream error: %s", exc)
    return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)


@api_view(["GET"])
def geocode(request):
    text = request.query_params.get("q", "").strip()[:MAX_QUERY_LEN]
    if len(text) < 3:
        return Response([])
    try:
        places = TomTomClient().autocomplete(text)
    except RoutingError as exc:
        return _upstream_error(exc)
    return Response([{"label": p.label, "lon": p.lon, "lat": p.lat} for p in places])


@api_view(["POST"])
def plan(request):
    ser = PlanRequestSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    data = ser.validated_data
    req = TripRequest(
        origin=(data["origin"]["lon"], data["origin"]["lat"]),
        destination=(data["destination"]["lon"], data["destination"]["lat"]),
        departure=data["departure"],
        load_lb=data["load_lb"],
        interval_mi=data["interval_mi"],
    )
    try:
        return Response(plan_trip(req))
    except (RoutingError, WeatherError) as exc:
        return _upstream_error(exc)


@api_view(["GET"])
def heatmap(_request, plan_id: str):
    try:
        return Response(corridor_heatmap(plan_id))
    except PlanNotFoundError:
        return Response({"detail": "Plan expired — please plan the trip again."}, status=status.HTTP_404_NOT_FOUND)
    except WeatherError as exc:
        return _upstream_error(exc)
