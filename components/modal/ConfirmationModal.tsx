import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

// Simple full-screen confirmation modal
export function ConfirmationModal({
  visible,
  title,
  message,
  onConfirm,
  onCancel,
  isDark
}: {
  visible: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDark: boolean;
}) {
  if (!visible) return null;

  return (
    <View style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 9999,
    }}>
      <View style={{
        backgroundColor: isDark ? '#1f2937' : '#ffffff',
        borderRadius: 16,
        padding: 24,
        margin: 20,
        minWidth: 300,
        maxWidth: 360,
        borderWidth: 1,
        borderColor: isDark ? '#374151' : '#e5e7eb',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
      }}>
        <Text style={{
          fontSize: 20,
          fontWeight: '700',
          color: isDark ? '#ffffff' : '#000000',
          marginBottom: 16,
          textAlign: 'center',
        }}>
          {title}
        </Text>
        <Text style={{
          fontSize: 16,
          color: isDark ? '#d1d5db' : '#374151',
          marginBottom: 24,
          lineHeight: 24,
          textAlign: 'center',
        }}>
          {message}
        </Text>
        <View style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          gap: 16,
        }}>
          <TouchableOpacity
            style={{
              flex: 1,
              paddingVertical: 12,
              paddingHorizontal: 20,
              borderRadius: 8,
              backgroundColor: 'transparent',
              borderWidth: 1,
              borderColor: isDark ? '#6b7280' : '#d1d5db',
            }}
            onPress={onCancel}
          >
            <Text style={{
              fontSize: 16,
              fontWeight: '600',
              color: isDark ? '#9ca3af' : '#6b7280',
              textAlign: 'center',
            }}>
              Annulla
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{
              flex: 1,
              paddingVertical: 12,
              paddingHorizontal: 20,
              borderRadius: 8,
              backgroundColor: '#dc2626',
            }}
            onPress={onConfirm}
          >
            <Text style={{
              fontSize: 16,
              fontWeight: '600',
              color: '#ffffff',
              textAlign: 'center',
            }}>
              Conferma
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
