from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers

MAX_DAYS_AHEAD = 7


class PointSerializer(serializers.Serializer):
    lon = serializers.FloatField(min_value=-180, max_value=180)
    lat = serializers.FloatField(min_value=-90, max_value=90)


class PlanRequestSerializer(serializers.Serializer):
    origin = PointSerializer()
    destination = PointSerializer()
    departure = serializers.DateTimeField()
    load_lb = serializers.FloatField(min_value=0, max_value=200_000)
    interval_mi = serializers.ChoiceField(choices=[10, 25, 50])

    def validate_load_lb(self, value):
        # FloatField would quietly read JSON `true` as 1 lb.
        if isinstance(self.initial_data.get("load_lb"), bool):
            raise serializers.ValidationError("A valid number is required.")
        return value

    def validate_departure(self, value):
        now = timezone.now()
        if value < now - timedelta(hours=1):
            raise serializers.ValidationError("Departure can't be in the past.")
        if value > now + timedelta(days=MAX_DAYS_AHEAD):
            raise serializers.ValidationError(
                f"Departure must be within {MAX_DAYS_AHEAD} days — forecasts beyond that aren't reliable."
            )
        return value

    def validate(self, attrs):
        o, d = attrs["origin"], attrs["destination"]
        if abs(o["lon"] - d["lon"]) < 1e-4 and abs(o["lat"] - d["lat"]) < 1e-4:
            raise serializers.ValidationError("Origin and destination are the same place.")
        return attrs
