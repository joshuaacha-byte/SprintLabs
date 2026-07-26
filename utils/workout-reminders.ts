import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { AthleteProfile, ScheduledDay, TrainingLog } from '@/types';
import { getAthleteProfile } from '@/utils/athlete-profile';
import { getFutureWorkoutOverrides, getTrainingLogs, getWeekSchedule } from '@/utils/storage';

const REMINDER_IDS_KEY = 'sprintlab.workout-reminder-ids.v1';
const CHANNEL_ID = 'workout-reminders';
const HORIZON_DAYS = 28;

type ScheduledReminder = {
  id: string;
  date: string;
  scheduledAt?: string;
};

export type ReminderSyncResult =
  | { status: 'scheduled'; count: number; nextAt: string | null }
  | { status: 'disabled' | 'unsupported' | 'permission-denied'; count: 0 };

const dateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const exerciseCount = (day: ScheduledDay) =>
  day.workout?.sections.reduce((count, section) => count + section.exercises.length, 0) ?? 0;

export function reminderTimeLabel(hour = 16, minute = 0) {
  const value = new Date(2020, 0, 1, hour, minute);
  return value.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function workoutReminderPreview(day: ScheduledDay) {
  if (day.kind !== 'workout' || !day.workout) return null;
  const count = exerciseCount(day);
  const details = [
    count ? `${count} exercise${count === 1 ? '' : 's'}` : null,
    day.workout.durationMinutes ? `about ${day.workout.durationMinutes} min` : null,
  ].filter(Boolean).join(' · ');
  return {
    title: `Today: ${day.workout.title}`,
    body: details || day.workout.purpose || 'Open SprintLab to preview today’s session.',
  };
}

async function notificationsModule() {
  if (Platform.OS === 'web') return null;
  return import('expo-notifications');
}

async function readScheduledReminders(): Promise<ScheduledReminder[]> {
  const value = await AsyncStorage.getItem(REMINDER_IDS_KEY);
  return value ? JSON.parse(value) as ScheduledReminder[] : [];
}

async function cancelOwnedReminders() {
  const Notifications = await notificationsModule();
  if (!Notifications) return;
  const reminders = await readScheduledReminders();
  await Promise.all(reminders.map(reminder =>
    Notifications.cancelScheduledNotificationAsync(reminder.id).catch(() => undefined),
  ));
  await AsyncStorage.removeItem(REMINDER_IDS_KEY);
}

async function configureNotifications() {
  const Notifications = await notificationsModule();
  if (!Notifications) return null;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Workout reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 200, 120, 200],
      lightColor: '#C7FF22',
    });
  }
  return Notifications;
}

function completedDates(logs: TrainingLog[]) {
  return new Set(logs
    .map(log => log.date));
}

const weekdayByIndex = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

function isBlockedReminderDate(profile: AthleteProfile, date: Date, dateValue: string) {
  const weekday = weekdayByIndex[date.getDay()];
  if (profile.preferredRestDay === weekday) return true;
  if ((profile.sportPracticeDays ?? []).includes(weekday)) return true;
  if ((profile.gameOrCompetitionDays ?? []).some(value => value === weekday || value === dateValue)) return true;
  if ((profile.seasonCalendar?.priorityMeets ?? []).some(meet => meet.date === dateValue)) return true;
  return false;
}

export async function syncWorkoutReminders(options?: {
  requestPermission?: boolean;
  profile?: AthleteProfile | null;
  schedule?: ScheduledDay[];
}): Promise<ReminderSyncResult> {
  const Notifications = await configureNotifications();
  if (!Notifications) return { status: 'unsupported', count: 0 };

  const profile = options?.profile ?? await getAthleteProfile();
  await cancelOwnedReminders();
  if (!profile?.workoutReminderEnabled) return { status: 'disabled', count: 0 };

  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted' && options?.requestPermission) {
    permission = await Notifications.requestPermissionsAsync();
  }
  if (permission.status !== 'granted') return { status: 'permission-denied', count: 0 };

  const [schedule, logs, overrides] = await Promise.all([
    options?.schedule ? Promise.resolve(options.schedule) : getWeekSchedule(),
    getTrainingLogs(),
    getFutureWorkoutOverrides(),
  ]);
  const finishedDates = completedDates(logs);
  const reminders: ScheduledReminder[] = [];
  const now = new Date();

  for (let offset = 0; offset < HORIZON_DAYS; offset += 1) {
    const triggerDate = new Date(now);
    triggerDate.setDate(now.getDate() + offset);
    triggerDate.setHours(profile.workoutReminderHour ?? 16, profile.workoutReminderMinute ?? 0, 0, 0);
    if (triggerDate <= now) continue;
    const date = dateKey(triggerDate);
    if (isBlockedReminderDate(profile, triggerDate, date)) continue;
    const override = overrides.find(item => item.date === date);
    const recurringDay = schedule.find(day => day.dayIndex === triggerDate.getDay());
    const scheduledDay: ScheduledDay | undefined = override
      ? {
          dayIndex: triggerDate.getDay() as ScheduledDay['dayIndex'],
          shortLabel: recurringDay?.shortLabel ?? '',
          fullLabel: recurringDay?.fullLabel ?? '',
          kind: 'workout',
          workout: override.workout,
        }
      : recurringDay;
    const preview = scheduledDay ? workoutReminderPreview(scheduledDay) : null;
    if (!scheduledDay || !preview || finishedDates.has(date)) continue;

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: preview.title,
        body: preview.body,
        sound: true,
        data: { route: '/', kind: 'workout-reminder', date },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
        channelId: Platform.OS === 'android' ? CHANNEL_ID : undefined,
      },
    });
    reminders.push({ id, date, scheduledAt: triggerDate.toISOString() });
  }

  await AsyncStorage.setItem(REMINDER_IDS_KEY, JSON.stringify(reminders));
  return { status: 'scheduled', count: reminders.length, nextAt: reminders[0]?.scheduledAt ?? null };
}

export async function disableWorkoutReminders() {
  await cancelOwnedReminders();
}

export async function scheduleWorkoutReminderTest(profile?: AthleteProfile | null) {
  const Notifications = await configureNotifications();
  if (!Notifications) return { status: 'unsupported' as const };
  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== 'granted') return { status: 'permission-denied' as const };

  const schedule = await getWeekSchedule();
  const today = schedule.find(day => day.dayIndex === new Date().getDay());
  const preview = today ? workoutReminderPreview(today) : null;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: preview?.title ?? 'SprintLab reminder test',
      body: preview?.body ?? `Notifications are working${profile?.name ? ` for ${profile.name}` : ''}.`,
      sound: true,
      data: { route: '/', kind: 'workout-reminder-test' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 5,
      channelId: Platform.OS === 'android' ? CHANNEL_ID : undefined,
    },
  });
  return { status: 'scheduled' as const };
}

export async function initializeWorkoutNotifications(onOpenToday: () => void) {
  const Notifications = await configureNotifications();
  if (!Notifications) return () => undefined;

  const openIfWorkoutReminder = (response: import('expo-notifications').NotificationResponse | null) => {
    if (response?.notification.request.content.data.kind !== 'workout-reminder') return;
    onOpenToday();
    Notifications.clearLastNotificationResponse();
  };

  openIfWorkoutReminder(Notifications.getLastNotificationResponse());
  const subscription = Notifications.addNotificationResponseReceivedListener(openIfWorkoutReminder);
  void syncWorkoutReminders();
  return () => subscription.remove();
}
