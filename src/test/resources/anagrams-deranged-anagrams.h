/*
This header file contains necessary imports, public type declarations and exported functions for a program that finds the longest pair of deranged words in a given dictionary.

The following are the details for each import, type and function:

*/

#include <stdio.h> // For standard input and output operations
#include <stdlib.h> // For memory allocation and deallocation operations
#include <string.h> // For string manipulation operations
#include <unistd.h> // For UNIX system calls
#include <sys/types.h> // For system data types
#include <fcntl.h> // For file control operations
#include <sys/stat.h> // For file system status operations

/*
The letter frequency is used to lookup each character in the word, in order to reduce the word insertion time. The following variables are used:
*/
const char *freq = "zqxjkvbpygfwmucldrhsnioate"; // A string of the letters sorted by frequency
int char_to_idx[128]; // An integer array that stores the index for each character in the frequency string

/*
A trie-like structure is used to store and search the words in the dictionary. The following struct and union types are used:
*/
struct word { // A struct to store each word
const char *w; // A pointer to the word
struct word *next; // A pointer to the next word in the list
};

union node { // A union type that can store either a down pointer array or a list pointer array
union node *down[10]; // A pointer array that stores 10 union node pointers
struct word *list[10]; // A pointer array that stores 10 struct word pointers
};

/*
The following functions are exported and can be used in the main program:

deranged
Parameters: Two strings s1 and s2
Return value: An integer
Purpose: Determines if two strings are deranged by comparing each character in the strings
count_letters
Parameters: A string s and an unsigned char array c
Return value: An integer
Purpose: Counts the number of letters in the string and stores the count of each letter in the c array
insert
Parameters: A pointer to a union node root, a string s, and an unsigned char array cnt
Return value: A pointer to a const char
Purpose: Inserts a word into the trie-like structure and returns a pointer to a matching word if it exists
*/

int deranged(const char *s1, const char *s2); // Function declaration for deranged function
int count_letters(const char *s, unsigned char *c); // Function declaration for count_letters function
const char * insert(union node *root, const char *s, unsigned char *cnt); // Function declaration for insert function