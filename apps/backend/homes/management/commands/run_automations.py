import time
import logging
from datetime import datetime, timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from homes.models import Automation
from homes.utils import get_coords, get_solar_times
from homes.serializers import AutomationSerializer

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = 'Runs the automation scheduler'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('Starting automation scheduler...'))
        
        from homes.services import update_all_solar_automations
        try:
            update_all_solar_automations()
            self.stdout.write(self.style.SUCCESS("Initial update of solar times completed."))
        except Exception as e:
             self.stdout.write(self.style.ERROR(f"Error updating solar times: {e}"))
        
        last_solar_update = datetime.now().date()

        while True:
            now = datetime.now()
            current_time = now.time().replace(second=0, microsecond=0)
            current_weekday = now.strftime('%a').lower() # mon, tue, wed...
            print(f"Current Time: {current_time}")

            # New Day Solar Time Updates
            if now.date() > last_solar_update:
                self.stdout.write(self.style.SUCCESS(f'New day detected: {now.date()}. Updating solar times.'))
                try:
                    update_all_solar_automations()
                except Exception as e:
                    self.stdout.write(self.style.ERROR(f"Error updating solar times: {e}"))
                last_solar_update = now.date()

            automations = Automation.objects.filter(is_active=True, time=current_time)
            
            for automation in automations:
                if current_weekday in [d.lower() for d in automation.repeat_days]:
                    self.execute_automation(automation)

            sleep_seconds = 60 - datetime.now().second
            time.sleep(sleep_seconds)

    def execute_automation(self, automation):
        """
        Executes the action for the automation.
        Current implementation: Print to stdout.
        """
        self.stdout.write(self.style.SUCCESS(f"--------------- AUTOMATION EXECUTED ---------------"))
        self.stdout.write(f"Title: {automation.title}")
        self.stdout.write(f"Device: {automation.device.device_name}")
        self.stdout.write(f"Action Payload: {automation.action}")
        self.stdout.write(f"Time: {datetime.now()}")
        self.stdout.write(self.style.SUCCESS(f"---------------------------------------------------"))
