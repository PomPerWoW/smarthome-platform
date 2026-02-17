import time
import threading
import logging
import os
from datetime import datetime
from django.conf import settings

logger = logging.getLogger(__name__)

class Scheduler:
    _instance = None
    _thread = None
    _running = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(Scheduler, cls).__new__(cls)
        return cls._instance

    def start(self):
        """
        Starts the scheduler in a daemon thread if not already running.
        """
        if self._running:
            return

        # Check for auto-reloader to avoid double threads
        # When running with 'python manage.py runserver', the reloader spawns a child process.
        # The child process has 'RUN_MAIN' set to 'true'. We only want to run in that child process.
        # If running with external WSGI server (like gunicorn), RUN_MAIN might not be set, so we should run.
        
        should_run = False
        
        # Scenario 1: Developing with runserver (reloader enabled)
        if os.environ.get('RUN_MAIN') == 'true':
            should_run = True
            
        # Scenario 2: Production or --noreload (reloader disabled)
        # In this case RUN_MAIN is not set, but we still want to run.
        # However, checking if we are in the main process vs reloader wrapper is tricky.
        # A simple heuristic: if we are here and apps are ready, we should probably run unless we are the reloader wrapper.
        # But 'runserver' wrapper also loads apps. 
        # For simplicity in this environment: "If RUN_MAIN is true OR if we aren't using runserver's reloader logic implicitly"
        # But user specifically asked for "run with backend service".
        
        # Let's rely on the signal from apps.py which will only call this.
        # But we need to make sure we don't start TWICE if apps.py calls us twice.
        # The self._running check handles instances, but class level tracking might be safer if new instances are created.
        
        # Actually, let's just use the strict RUN_MAIN check if we detect runserver.
        import sys
        is_runserver = 'runserver' in sys.argv
        
        if is_runserver:
             if os.environ.get('RUN_MAIN') == 'true':
                 should_run = True
        else:
             # Gunicorn or other WSGI
             should_run = True

        if should_run:
            logger.info("Starting Automation Scheduler...")
            self._running = True
            # Create thread
             # We need to import here to avoid early import issues if called too early, though apps.ready is safe.
            self._thread = threading.Thread(target=self._run_loop, daemon=True)
            self._thread.start()
        else:
            logger.info("Scheduler not starting (Reloader parent process or inactive).")


    def stop(self):
        self._running = False
        if self._thread:
            self._thread.join(timeout=2)

    def _run_loop(self):
        """
        The main loop.
        """
        from .services import update_all_solar_automations
        from .models import Automation
        
        # Initial wait to let DB connections settle if needed
        time.sleep(5)
        
        try:
            update_all_solar_automations()
            logger.info("Initial update of solar times completed.")
        except Exception as e:
            logger.error(f"Error updating solar times: {e}")

        last_solar_update = datetime.now().date()

        while self._running:
            try:
                now = datetime.now()
                current_time = now.time().replace(second=0, microsecond=0)
                current_weekday = now.strftime('%a').lower()

                # Solar Update
                if now.date() > last_solar_update:
                    logger.info(f"New day detected: {now.date()}. Updating solar times.")
                    update_all_solar_automations()
                    last_solar_update = now.date()

                # Automation Check
                automations = Automation.objects.filter(is_active=True, time=current_time)
                for automation in automations:
                     if current_weekday in [d.lower() for d in automation.repeat_days]:
                        self._execute_automation(automation)

                # Sleep logic
                sleep_seconds = 60 - datetime.now().second
                if sleep_seconds < 0: sleep_seconds = 0
                time.sleep(sleep_seconds)

            except Exception as e:
                logger.error(f"Scheduler loop error: {e}")
                time.sleep(10) # Prevent tight loop on error

    def _execute_automation(self, automation):
        print(f"--------------- AUTOMATION EXECUTED ---------------")
        print(f"Title: {automation.title}")
        print(f"Device: {automation.device.device_name}")
        print(f"Action Payload: {automation.action}")
        print(f"Time: {datetime.now()}")
        
        # SCADA Command Implementation
        from .scada import ScadaManager
        
        device = automation.device
        if not device.tag:
            print("Device has no SCADA tag, skipping.")
            print(f"---------------------------------------------------")
            return

        actions = automation.action
        scada = ScadaManager()

        # Iterate over action items and map to SCADA tags
        for key, value in actions.items():
            tag_suffix = None
            
            # Common
            if key == 'is_on':
                tag_suffix = '.onoff'
            
            # Lightbulb
            elif key == 'color':
                tag_suffix = '.Color'
            elif key == 'brightness':
                tag_suffix = '.Brightness'
                
            # AC
            elif key == 'temp':
                tag_suffix = '.set_temp'
            
            # Fan
            elif key == 'speed':
                tag_suffix = '.speed'
            elif key == 'swing':
                tag_suffix = '.shake'
                
            # Television
            elif key == 'volume':
                tag_suffix = '.volume'
            elif key == 'channel':
                tag_suffix = '.channel'
            elif key == 'is_mute':
                tag_suffix = '.mute'
                
            if tag_suffix:
                full_tag = f"{device.tag}{tag_suffix}"
                print(f"Sending SCADA command: {full_tag} = {value}")
                scada.send_command(full_tag, value)
            else:
                print(f"Unknown action key: {key}")

        print(f"---------------------------------------------------")
