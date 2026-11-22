import { Modal, Text, View } from 'react-native';
import { Button } from './ui';

/** In-app confirm (Alert.alert does nothing on the web). */
export function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 items-center justify-center bg-black/50 px-6">
        <View accessibilityViewIsModal className="w-full max-w-sm rounded-2xl bg-white p-5 dark:bg-slate-900">
          <Text accessibilityRole="header" className="mb-2 text-lg font-bold text-slate-900 dark:text-white">
            {title}
          </Text>
          <Text className="mb-5 text-base text-slate-600 dark:text-slate-300">{message}</Text>
          <View className="flex-row gap-2">
            <Button title="Cancel" variant="secondary" onPress={onCancel} className="flex-1" />
            <Button title={confirmLabel} variant="danger" onPress={onConfirm} className="flex-1" />
          </View>
        </View>
      </View>
    </Modal>
  );
}
