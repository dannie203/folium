import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import type { Book } from '@folium/shared';
import { getDatabase } from '../src/db';

export default function BookshelfScreen() {
  const [books, setBooks] = useState<Book[]>([]);

  const loadBooks = async () => {
    try {
      const db = await getDatabase();
      const rows = await db.getAllAsync<Book>(
        'SELECT * FROM books ORDER BY updated_at DESC'
      );
      setBooks(rows);
    } catch (e) {
      console.error('Error fetching books:', e);
    }
  };

  useEffect(() => {
    loadBooks();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      {books.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📖</Text>
          <Text style={styles.emptyTitle}>Tủ sách của bạn còn trống</Text>
          <Text style={styles.emptySubtitle}>
            Thêm sách EPUB hoặc PDF từ thiết bị hoặc đồng bộ qua Google Drive.
          </Text>
          <TouchableOpacity style={styles.button} activeOpacity={0.8}>
            <Text style={styles.buttonText}>+ Thêm sách từ máy</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={books}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.bookCard}>
              <Text style={styles.bookTitle}>{item.title}</Text>
              <Text style={styles.bookAuthor}>{item.author}</Text>
            </View>
          )}
          contentContainerStyle={styles.listContainer}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090B',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 56,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FAFAFA',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#A1A1AA',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },
  listContainer: {
    padding: 16,
  },
  bookCard: {
    backgroundColor: '#18181B',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  bookTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FAFAFA',
    marginBottom: 4,
  },
  bookAuthor: {
    fontSize: 13,
    color: '#A1A1AA',
  },
});
