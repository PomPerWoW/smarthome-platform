import time

from django.core.management.base import BaseCommand
from django.utils import timezone

from homes.models import Automation
from homes.services import execute_scheduled_automation, update_all_solar_automations


class Command(BaseCommand):
    help = "Runs the automation scheduler"

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS("Starting automation scheduler..."))

        try:
            update_all_solar_automations()
            self.stdout.write(
                self.style.SUCCESS("Initial update of solar times completed.")
            )
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Error updating solar times: {e}"))

        last_solar_update = timezone.now().date()

        while True:
            now = timezone.now()
            current_time = now.time().replace(second=0, microsecond=0)
            current_weekday = now.strftime("%a").lower()
            self.stdout.write(f"Current Time (UTC): {current_time}")

            if now.date() > last_solar_update:
                self.stdout.write(
                    self.style.SUCCESS(
                        f"New day detected: {now.date()}. Updating solar times."
                    )
                )
                try:
                    update_all_solar_automations()
                except Exception as e:
                    self.stdout.write(self.style.ERROR(f"Error updating solar times: {e}"))
                last_solar_update = now.date()

            automations = Automation.objects.filter(is_active=True, time=current_time)

            for automation in automations:
                days = automation.repeat_days or []
                repeat_lower = [d.lower() for d in days]
                if not repeat_lower or current_weekday in repeat_lower:
                    self.execute_automation(automation)

            sleep_seconds = 60 - timezone.now().second
            time.sleep(sleep_seconds)

    def execute_automation(self, automation):
        self.stdout.write(
            self.style.SUCCESS("--------------- AUTOMATION EXECUTED ---------------")
        )
        self.stdout.write(f"Title: {automation.title}")
        self.stdout.write(f"Device: {automation.device.device_name}")
        self.stdout.write(f"Action Payload: {automation.action}")
        self.stdout.write(f"Time (UTC): {timezone.now()}")
        execute_scheduled_automation(automation)
        self.stdout.write(self.style.SUCCESS("---------------------------------------------------"))
