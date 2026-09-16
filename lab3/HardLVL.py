
class Library:
    def __init__(self, name: str):
        self.name = name
        self.books = []  # Коллекция книг

    def add_book(self, book_title: str):
        """Добавление книги"""
        self.books.append(book_title)
        print(f"[{self.name}] Книга '{book_title}' успешно добавлена.")

    def remove_book(self, book_title: str):
        """Удаление книги"""
        if book_title in self.books:
            self.books.remove(book_title)
            print(f"[{self.name}] Книга '{book_title}' удалена из библиотеки.")
        else:
            print(f"[{self.name}] Ошибка: Книга '{book_title}' не найдена.")

    def search_book(self, book_title: str):
        """Поиск книги по названию"""
        if book_title in self.books:
            print(f"[{self.name}] Книга '{book_title}' есть в наличии.")
            return True
        print(f"[{self.name}] Книга '{book_title}' отсутствует.")
        return False
