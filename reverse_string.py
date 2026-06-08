def reverse_string(s):
    """
    Reverse a given string.
    
    Args:
        s (str): The string to reverse.
    
    Returns:
        str: The reversed string.
    """
    return s[::-1]


# Example usage
if __name__ == "__main__":
    test_strings = [
        "Hello, World!",
        "Python",
        "12345",
        "",
        "مرحبا"
    ]
    
    for text in test_strings:
        reversed_text = reverse_string(text)
        print(f"Original: '{text}' -> Reversed: '{reversed_text}'")
